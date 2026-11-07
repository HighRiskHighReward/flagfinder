import { createHash } from "node:crypto";

/** CSRF defense for JSON/form POSTs: require same-origin Origin (or Referer) header. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") ?? (req.headers.get("referer") ? new URL(req.headers.get("referer")!).origin : null);
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}

/** Privacy-preserving client key for rate limiting (hashed IP, never stored raw). */
export function clientKey(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(ip).digest("hex").slice(0, 24);
}
