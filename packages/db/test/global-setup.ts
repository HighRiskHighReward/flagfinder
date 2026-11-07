import pg from "pg";
import { migrate, resetSchema } from "../src/migrate";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://flagfinder:flagfinder@localhost:5432/flagfinder_test";

/** Fresh schema for every test run. */
export default async function setup() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  await resetSchema(pool);
  await migrate(pool);
  await pool.end();
}
