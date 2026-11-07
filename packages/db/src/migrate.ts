import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type pg from "pg";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function migrate(db: pg.Pool, log: (m: string) => void = () => {}) {
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      log(`applied ${file}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${file} failed: ${(e as Error).message}`, { cause: e });
    } finally {
      client.release();
    }
  }
}

export async function resetSchema(db: pg.Pool) {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
}
