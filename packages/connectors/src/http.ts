import { brand } from "@ff/config/brand";
import { parseRetryAfterMs, TokenBucket } from "@ff/core";
import type { FetchResult, PoliteHttp } from "./contract";
import { parseRobots, robotsVerdict, type RobotsRules } from "./robots";
import { safeFetch, SsrfError, type SafeFetchOptions } from "./ssrf";

/**
 * The only way connectors reach the network (Invariants 8, 9): robots.txt honored (and its
 * crawl-delay), per-domain token bucket, conditional requests, identifying User-Agent,
 * SSRF-safe fetching. Never sends cookies or credentials; never attempts to bypass auth walls.
 */
export interface PoliteHttpOptions {
  ratePerMinute: number;
  userAgent?: string;
  sleep?: (ms: number) => Promise<void>;
  fetchOptions?: SafeFetchOptions;
  robotsCache?: Map<string, { rules: RobotsRules | "disallow_all" | "allow_all"; at: number }>;
}

const buckets = new Map<string, TokenBucket>();
const defaultRobotsCache = new Map<string, { rules: RobotsRules | "disallow_all" | "allow_all"; at: number }>();

export function createPoliteHttp(o: PoliteHttpOptions): PoliteHttp {
  const ua = o.userAgent ?? brand.userAgent;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const cache = o.robotsCache ?? defaultRobotsCache;

  async function robots(origin: string) {
    const hit = cache.get(origin);
    if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.rules;
    let rules: RobotsRules | "disallow_all" | "allow_all";
    try {
      const r = await safeFetch(`${origin}/robots.txt`, { ...o.fetchOptions, headers: { "user-agent": ua }, maxBytes: 500_000 });
      rules = r.status >= 200 && r.status < 300 ? parseRobots(r.body) : r.status >= 400 && r.status < 500 ? "allow_all" : "disallow_all";
    } catch { rules = "disallow_all"; }
    cache.set(origin, { rules, at: Date.now() });
    return rules;
  }

  return {
    async get(url, opts = {}): Promise<FetchResult> {
      const fetchedAt = new Date();
      let u: URL;
      try { u = new URL(url); } catch { return { kind: "error", url, error: "invalid URL", fetchedAt }; }
      const rules = await robots(u.origin);
      if (rules === "disallow_all") return { kind: "disallowed", url, reason: "robots.txt unreachable (5xx/network) — treated as disallow", fetchedAt };
      let delay = 0;
      if (rules !== "allow_all") {
        const v = robotsVerdict(rules, ua, u.pathname + u.search);
        if (!v.allowed) return { kind: "disallowed", url, reason: "robots.txt disallows this path", fetchedAt };
        if (v.crawlDelay) delay = v.crawlDelay * 1000;
      }
      const rate = delay ? Math.min(o.ratePerMinute, 60_000 / delay) : o.ratePerMinute;
      let bucket = buckets.get(u.host);
      if (!bucket) { bucket = new TokenBucket(rate, 1); buckets.set(u.host, bucket); }
      for (let wait = bucket.take(); wait > 0; wait = bucket.take()) await sleep(wait);

      const headers: Record<string, string> = { "user-agent": ua, accept: (opts.accept ?? ["*/*"]).join(", ") };
      if (opts.etag) headers["if-none-match"] = opts.etag;
      if (opts.lastModified) headers["if-modified-since"] = opts.lastModified;
      try {
        const r = await safeFetch(url, { ...o.fetchOptions, headers });
        if (r.status === 304) return { kind: "not_modified", url, fetchedAt };
        if (r.status === 404 || r.status === 410) return { kind: "missing", url, status: r.status, fetchedAt };
        if (r.status === 429 || r.status === 503) return { kind: "rate_limited", url, retryAfterMs: parseRetryAfterMs(r.headers.get("retry-after")), fetchedAt };
        if (r.status === 401 || r.status === 403) return { kind: "disallowed", url, reason: `HTTP ${r.status}: access requires permission — not bypassed`, fetchedAt };
        if (r.status < 200 || r.status >= 300) return { kind: "error", url, status: r.status, error: `HTTP ${r.status}`, fetchedAt };
        return { kind: "ok", url: r.url, status: r.status, contentType: r.contentType, body: r.body, etag: r.headers.get("etag"), lastModified: r.headers.get("last-modified"), fetchedAt };
      } catch (e) {
        return { kind: "error", url, error: e instanceof SsrfError ? `blocked: ${e.message}` : (e as Error).message, fetchedAt };
      }
    },
  };
}

export function resetRateLimiters() { buckets.clear(); defaultRobotsCache.clear(); }
