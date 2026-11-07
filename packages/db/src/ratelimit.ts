import type pg from "pg";

/** Fixed-window rate limit stored in Postgres (works across web instances). */
export async function hitRateLimit(db: pg.Pool, bucket: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; count: number }> {
  const r = await db.query<{ count: number }>(
    `INSERT INTO rate_limits (bucket, window_start, count) VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2) * $2), 1)
     ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1 RETURNING count`, [bucket, windowSeconds]);
  const count = r.rows[0]!.count;
  return { allowed: count <= limit, count };
}
