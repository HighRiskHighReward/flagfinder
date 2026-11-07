/** Exponential backoff with full jitter: sleep = random(0, min(cap, base * 2^attempt)). */
export function fullJitterDelayMs(attempt: number, baseMs = 1000, capMs = 15 * 60_000, rand: () => number = Math.random): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
  return Math.floor(rand() * ceiling);
}

/** Parse Retry-After (seconds or HTTP-date) → ms, capped. */
export function parseRetryAfterMs(value: string | null | undefined, now = Date.now(), capMs = 6 * 3600_000): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(capMs, secs * 1000);
  const at = Date.parse(value);
  if (!Number.isNaN(at)) return Math.min(capMs, Math.max(0, at - now));
  return null;
}

/** Deterministic per-source offset in the hour: hash(source_id) mod 3600 seconds. */
export function hourOffsetSeconds(sourceId: string): number {
  let h = 2166136261;
  for (let i = 0; i < sourceId.length; i++) { h ^= sourceId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 3600;
}

/** Token bucket (per domain). */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private readonly ratePerMinute: number, private readonly burst = 1, private readonly clock: () => number = Date.now) {
    this.tokens = burst;
    this.last = clock();
  }
  /** Returns ms to wait before a token is available (0 = take now). Takes the token when 0. */
  take(): number {
    const now = this.clock();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 60_000) * this.ratePerMinute);
    this.last = now;
    if (this.tokens >= 1) { this.tokens -= 1; return 0; }
    return Math.ceil(((1 - this.tokens) / this.ratePerMinute) * 60_000);
  }
}
