import { loadEnv } from "@ff/config";
import { PgBoss } from "pg-boss";

export const QUEUES = {
  discover: { name: "discover", concurrency: 2 },
  refresh: { name: "refresh", concurrency: 4 },
  deadline: { name: "deadline-check", concurrency: 1 },
  sweep: { name: "review-sweep", concurrency: 1 },
  alerts: { name: "alerts", concurrency: 1 },
  reparse: { name: "reparse", concurrency: 1 },
  submissions: { name: "submissions", concurrency: 1 },
} as const;
export const DEAD_LETTER = "dead-letter";

export interface SendOpts { singletonKey?: string; startAfterSeconds?: number; priority?: number }
export interface JobQueue { send(queue: string, data: object, opts?: SendOpts): Promise<string | null> }

export async function startBoss(connectionString: string, opts: { schedule: boolean }): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString, max: loadEnv().DB_POOL_MAX, schedule: opts.schedule, application_name: opts.schedule ? "flagfinder-scheduler" : "flagfinder-worker" });
  boss.on("error", (e) => process.stderr.write(JSON.stringify({ level: "error", event: "pgboss_error", message: e.message }) + "\n"));
  await boss.start();
  await boss.createQueue(DEAD_LETTER).catch(() => {});
  for (const q of Object.values(QUEUES)) {
    // Retries are managed by our handlers (full-jitter backoff + Retry-After); pg-boss's own
    // retry/dead-letter catches crashes (e.g. process killed mid-job).
    await boss.createQueue(q.name, { retryLimit: 1, retryDelay: 60, expireInSeconds: 900, deadLetter: DEAD_LETTER }).catch(() => {});
  }
  return boss;
}

export function bossQueue(boss: PgBoss): JobQueue {
  return {
    // pg-boss rejects explicitly-undefined options (e.g. priority: undefined) — only pass what's set.
    send: (queue, data, o = {}) => {
      const opts: Record<string, string | number> = {};
      if (o.singletonKey !== undefined) opts.singletonKey = o.singletonKey;
      if (o.startAfterSeconds !== undefined) opts.startAfter = Math.max(0, Math.round(o.startAfterSeconds));
      if (o.priority !== undefined) opts.priority = Math.round(o.priority);
      return boss.send(queue, data, opts);
    },
  };
}
