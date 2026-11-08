import { loadEnv } from "@ff/config";
import { getPool } from "@ff/db";
import { bossQueue, QUEUES, startBoss } from "./queue";
import { createLogger } from "./log";
import { planDue } from "./plan";

/**
 * Long-running scheduler process (not serverless). Every tick it plans due source refreshes
 * with per-source offsets + jitter and the bucket budget; pg-boss cron drives the periodic
 * deadline-check, review-sweep and alerts jobs. It needs only the database — the web app can be down.
 */
const env = loadEnv();
const log = createLogger({ process: "scheduler" });
const db = getPool(env.DATABASE_URL);
const boss = await startBoss(env.DATABASE_URL, { schedule: true });
const queue = bossQueue(boss);
const TICK = Number(process.env.SCHEDULER_TICK_SECONDS ?? 60);
const HOURLY_CAPACITY = Number(process.env.SCHEDULER_HOURLY_CAPACITY ?? 120);

await boss.schedule(QUEUES.sweep.name, "7 * * * *", {}, { tz: "UTC" });
await boss.schedule(QUEUES.deadline.name, "23 */6 * * *", {}, { tz: "UTC" });
await boss.schedule(QUEUES.alerts.name, "*/5 * * * *", {}, { tz: "UTC" });
await boss.schedule(QUEUES.submissions.name, "* * * * *", {}, { tz: "UTC" });

export async function tick(now = new Date()) {
  const sources = (await db.query(`SELECT id, priority_bucket, refresh_cadence_minutes, last_success_at, last_attempt_at, next_scheduled_at FROM sources WHERE status='enabled' AND NOT paused AND NOT is_synthetic AND connector_key NOT IN ('submission','none')
                                    AND (circuit_open_until IS NULL OR circuit_open_until < now())`)).rows;
  const weights = Object.fromEntries((await db.query(`SELECT bucket, weight::float8 AS weight FROM crawl_budget`)).rows.map((r) => [r.bucket, r.weight]));
  const runs = Object.fromEntries((await db.query(`SELECT s.priority_bucket AS b, count(*)::int AS n FROM ingestion_runs r JOIN sources s ON s.id=r.source_id WHERE r.started_at > now() - interval '1 hour' GROUP BY 1`)).rows.map((r) => [r.b, r.n]));
  const due = planDue(sources, now, { tickSeconds: TICK, weights, hourlyCapacity: HOURLY_CAPACITY, runsLastHour: runs });
  for (const d of due) {
    await queue.send(QUEUES.refresh.name, { sourceId: d.sourceId, jobType: "refresh", window: d.window }, { singletonKey: `refresh:${d.sourceId}:${d.window}`, startAfterSeconds: d.startAfterSeconds, priority: d.priority });
    await db.query(`UPDATE sources SET next_scheduled_at = now() + make_interval(secs => $2) WHERE id=$1`, [d.sourceId, d.startAfterSeconds]);
  }
  const reparse = (await db.query(`UPDATE sources SET config = config - 'reparseRequestedAt' WHERE config ? 'reparseRequestedAt' RETURNING id`)).rows;
  for (const r of reparse) await queue.send(QUEUES.reparse.name, { sourceId: r.id }, { singletonKey: `reparse:${r.id}` });
  await db.query(`INSERT INTO scheduler_heartbeats (process, beat_at, details) VALUES ('scheduler', now(), $1) ON CONFLICT (process) DO UPDATE SET beat_at=now(), details=EXCLUDED.details`, [JSON.stringify({ enabledSources: sources.length, planned: due.length })]);
  log("scheduler_tick", { enabledSources: sources.length, planned: due.length });
}

await tick();
const timer = setInterval(() => { tick().catch((e) => log("scheduler_tick_failed", { error: (e as Error).message })); }, TICK * 1000);
log("scheduler_started", { tickSeconds: TICK, hourlyCapacity: HOURLY_CAPACITY });
const shutdown = async () => { clearInterval(timer); await boss.stop({ graceful: true, timeout: 10_000 }); process.exit(0); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
