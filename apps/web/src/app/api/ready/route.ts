import { db } from "@/lib/server";

export async function GET() {
  const checks: Record<string, string> = {};
  try { await db().query("SELECT 1"); checks.database = "ok"; } catch (e) { checks.database = `error: ${(e as Error).message}`; }
  try {
    const r = await db().query(`SELECT to_regclass('pgboss.job') IS NOT NULL AS ok`);
    checks.queue = r.rows[0]?.ok ? "ok" : "not initialized (start the worker once)";
  } catch (e) { checks.queue = `error: ${(e as Error).message}`; }
  const ok = checks.database === "ok" && checks.queue === "ok";
  return Response.json({ status: ok ? "ready" : "not_ready", checks }, { status: ok ? 200 : 503 });
}
