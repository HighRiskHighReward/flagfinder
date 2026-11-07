import pg from "pg";
import { loadEnv } from "@ff/config";

// Return dates as plain 'YYYY-MM-DD' strings: all-day dates are local dates, never UTC midnight.
pg.types.setTypeParser(1082, (v) => v);
// bigint (fee minor units) -> number; safe for currency amounts.
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;
export type Queryable = pg.Pool | pg.PoolClient;

const pools = new Map<string, pg.Pool>();

export function getPool(url = loadEnv().DATABASE_URL): pg.Pool {
  let pool = pools.get(url);
  if (!pool) {
    pool = new pg.Pool({ connectionString: url, max: 10 });
    pools.set(url, pool);
  }
  return pool;
}

export async function closePools() {
  await Promise.all([...pools.values()].map((p) => p.end()));
  pools.clear();
}

/** Run fn in a transaction. Deferred constraint triggers (Invariant 6) fire at COMMIT. */
export async function withTx<T>(db: pg.Pool, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
