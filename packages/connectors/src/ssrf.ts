import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";

/**
 * SSRF protection for any server-side fetch of a URL we didn't author (submitted URLs, feeds):
 * http/https only, DNS resolved and every address checked against private/loopback/link-local/
 * metadata ranges (IPv4 + IPv6), connection pinned to the checked address (no DNS rebinding),
 * every redirect re-validated (max 3), response size capped, timeout enforced, content-type allowlist.
 */
export class SsrfError extends Error {}

function v4ToInt(ip: string): number { return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0; }
const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

export function isBlockedAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)));
  }
  if (fam === 6) {
    const a = ip.toLowerCase();
    if (a === "::" || a === "::1") return true;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? a.match(/^::ffff:0:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]!);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(a)) {
      const [hi, lo] = a.slice(7).split(":").map((h) => parseInt(h, 16)) as [number, number];
      return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = parseInt(a.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true;          // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true;          // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true;          // multicast
    if (a.startsWith("64:ff9b:") || a.startsWith("2001:db8") || a.startsWith("2002:") || a.startsWith("100::")) return true; // NAT64, docs, 6to4, discard
    if (a.startsWith("fd00:ec2::254") ) return true;       // AWS IPv6 metadata
    return false;
  }
  return true; // not an IP → block
}

export type Resolver = (host: string) => Promise<string[]>;
export const systemResolver: Resolver = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((r) => r.address);

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowedContentTypes?: string[];
  headers?: Record<string, string>;
  resolver?: Resolver;
  /** Test-only: permit loopback targets. Refused outside test environments. */
  unsafeAllowLoopback?: boolean;
}

export interface SafeResponse { url: string; status: number; headers: { get(name: string): string | null }; body: string; contentType: string | null }

async function validate(url: URL, resolver: Resolver, allowLoopback: boolean): Promise<string> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new SsrfError(`blocked scheme ${url.protocol}`);
  if (url.username || url.password) throw new SsrfError("credentials in URL are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.localhost|.*\.internal|.*\.local|metadata\.google\.internal)$/i.test(host) && !allowLoopback) throw new SsrfError(`blocked host ${host}`);
  const addrs = isIP(host) ? [host] : await resolver(host);
  if (!addrs.length) throw new SsrfError(`no addresses for ${host}`);
  for (const a of addrs) {
    if (allowLoopback && (a === "127.0.0.1" || a === "::1")) continue;
    if (isBlockedAddress(a)) throw new SsrfError(`blocked address ${a} for ${host}`);
  }
  return addrs[0]!;
}

export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  if (opts.unsafeAllowLoopback && (process.env.APP_ENV === "production" || process.env.NODE_ENV === "production")) throw new SsrfError("unsafeAllowLoopback is test-only");
  const resolver = opts.resolver ?? systemResolver;
  const maxRedirects = opts.maxRedirects ?? 3;
  const maxBytes = opts.maxBytes ?? 2_000_000;
  let url = new URL(input);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const pinned = await validate(url, resolver, !!opts.unsafeAllowLoopback);
    // Pin the TCP connection to the address we validated (defeats DNS rebinding).
    const dispatcher: Dispatcher = new Agent({
      connect: {
        lookup: (_h: string, o: { all?: boolean } | undefined, cb: (e: Error | null, addr: string | { address: string; family: number }[], fam?: number) => void) =>
          o?.all ? cb(null, [{ address: pinned, family: isIP(pinned) }]) : cb(null, pinned, isIP(pinned)),
      } as never,
      headersTimeout: opts.timeoutMs ?? 15_000, bodyTimeout: opts.timeoutMs ?? 15_000,
    });
    const ctrl = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
    // Use undici's own fetch so the pinned dispatcher matches the client version.
    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await undiciFetch(url, { redirect: "manual", signal: ctrl, headers: opts.headers, dispatcher });
    } catch (e) {
      await (dispatcher as Agent).close();
      throw e;
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      await (dispatcher as Agent).close();
      if (hop === maxRedirects) throw new SsrfError(`too many redirects (>${maxRedirects})`);
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    const ct = res.headers.get("content-type");
    const okTypes = opts.allowedContentTypes;
    if (okTypes && res.status === 200 && !okTypes.some((t) => (ct ?? "").toLowerCase().startsWith(t))) {
      await res.body?.cancel(); await (dispatcher as Agent).close();
      throw new SsrfError(`content-type ${ct} not allowed`);
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) { await res.body?.cancel(); await (dispatcher as Agent).close(); throw new SsrfError(`response larger than ${maxBytes} bytes`); }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) { await reader.cancel(); await (dispatcher as Agent).close(); throw new SsrfError(`response larger than ${maxBytes} bytes`); }
        chunks.push(value);
      }
    }
    await (dispatcher as Agent).close();
    return { url: url.toString(), status: res.status, headers: res.headers, contentType: ct, body: Buffer.concat(chunks).toString("utf8") };
  }
  throw new SsrfError("unreachable");
}
