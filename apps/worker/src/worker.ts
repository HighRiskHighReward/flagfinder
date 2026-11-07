import { loadEnv, integrationStatuses } from "@ff/config";
import { getPool } from "@ff/db";
import { bossQueue, QUEUES, startBoss } from "./queue";
import { createLogger } from "./log";
import { runSourceJob, type RefreshJob } from "./run-source";
import { deadlineCheck, reparseSource, reviewSweep } from "./jobs";
import { processAlerts } from "./alerts";
import { processPendingSubmissions } from "./submissions";
import { createExtractionProvider } from "@ff/providers";

/** Long-running worker process. Runs independently of the web app (no HTTP server here). */
const env = loadEnv();
const log = createLogger({ process: "worker" });
for (const i of integrationStatuses(env)) if (!i.configured) log("integration_missing", { name: i.name, fallback: i.fallback });
const db = getPool(env.DATABASE_URL);
const boss = await startBoss(env.DATABASE_URL, { schedule: false });
const queue = bossQueue(boss);
const deps = { db, queue, log, failureAlertThreshold: env.SOURCE_FAILURE_ALERT_THRESHOLD };

for (const q of [QUEUES.refresh, QUEUES.discover]) {
  await boss.work<RefreshJob>(q.name, { localConcurrency: q.concurrency, batchSize: 1 }, async ([job]) => {
    const r = await runSourceJob(deps, { ...job!.data, jobType: job!.data.jobType ?? (q.name as "refresh") });
    return r;
  });
}
await boss.work(QUEUES.deadline.name, { localConcurrency: 1 }, async () => deadlineCheck(db, queue, log));
await boss.work(QUEUES.sweep.name, { localConcurrency: 1 }, async () => reviewSweep(db, log));
await boss.work<{ sourceId: string }>(QUEUES.reparse.name, { localConcurrency: 1 }, async ([job]) => reparseSource(db, job!.data.sourceId, log));
await boss.work(QUEUES.alerts.name, { localConcurrency: 1 }, async () => processAlerts(db, log));
const llm = createExtractionProvider(env, db);
await boss.work(QUEUES.submissions.name, { localConcurrency: 1 }, async () => processPendingSubmissions(db, { llm, storageDir: env.STORAGE_DIR, log }));

setInterval(() => {
  db.query(`INSERT INTO scheduler_heartbeats (process, beat_at, details) VALUES ('worker', now(), '{}') ON CONFLICT (process) DO UPDATE SET beat_at=now()`).catch(() => {});
}, 30_000).unref();
await db.query(`INSERT INTO scheduler_heartbeats (process, beat_at) VALUES ('worker', now()) ON CONFLICT (process) DO UPDATE SET beat_at=now()`);
log("worker_started", { queues: Object.values(QUEUES).map((q) => q.name) });

const shutdown = async () => { log("worker_stopping"); await boss.stop({ graceful: true, timeout: 20_000 }); process.exit(0); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
