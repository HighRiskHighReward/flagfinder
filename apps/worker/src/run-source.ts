import type pg from "pg";
import { createPoliteHttp, getConnector, type ConnectorContext, type FetchResult, type PoliteHttp, type SourceConnector } from "@ff/connectors";
import { fullJitterDelayMs, normalizeUrl, sha256 } from "@ff/core";
import { ingestCandidate, markEventCheckFailed, markRecordMissing, openReview, storeRawPayload, type SourceRow } from "@ff/db";
import { DEAD_LETTER, type JobQueue } from "./queue";
import { createLogger, newCorrelationId, reportError, type Logger } from "./log";

export const MAX_ATTEMPTS = 4;
export const RETRY_BASE_MS = 30_000;
export const RETRY_CAP_MS = 30 * 60_000;

export interface RunDeps {
  db: pg.Pool;
  queue: JobQueue;
  now?: () => Date;
  rand?: () => number;
  httpFor?: (source: SourceRecord) => PoliteHttp;
  connectorFor?: (key: string) => SourceConnector | null;
  log?: Logger;
  failureAlertThreshold?: number;
  onAlert?: (msg: string, data: Record<string, unknown>) => void;
}

export interface RefreshJob { sourceId: string; jobType: "refresh" | "discover" | "deadline-check"; window?: string | null; attempt?: number; correlationId?: string }

interface SourceRecord extends SourceRow {
  connector_key: string; config: Record<string, unknown>; paused: boolean; circuit_open_until: Date | null; rate_limit_per_minute: number;
  consecutive_failures: number; parser_version: string; refresh_cadence_minutes: number;
}

export type RunResult =
  | { kind: "skipped"; reason: string }
  | { kind: "succeeded"; stats: Record<string, number> }
  | { kind: "retry_scheduled"; delayMs: number; reason: string }
  | { kind: "dead_lettered"; reason: string }
  | { kind: "failed"; reason: string };

type Failure = { retryable: boolean; reason: string; retryAfterMs?: number | null };

/** One source refresh: discover → fetch → parse → normalize → ingest. Idempotent per (source, job type, window). */
export async function runSourceJob(deps: RunDeps, job: RefreshJob): Promise<RunResult> {
  const now = deps.now ?? (() => new Date());
  const correlationId = job.correlationId ?? newCorrelationId();
  const log = (deps.log ?? createLogger()).child?.({ correlationId, sourceId: job.sourceId, jobType: job.jobType, attempt: job.attempt ?? 1 }) ?? deps.log ?? createLogger();
  const { db } = deps;

  const src = (await db.query<SourceRecord>(`SELECT * FROM sources WHERE id=$1`, [job.sourceId])).rows[0];
  if (!src) return { kind: "skipped", reason: "source_not_found" };
  if (src.status !== "enabled") return { kind: "skipped", reason: `source_status_${src.status}` };
  if (src.paused) return { kind: "skipped", reason: "source_paused" };
  if (src.circuit_open_until && new Date(src.circuit_open_until) > now()) return { kind: "skipped", reason: "circuit_open" };
  const connector = (deps.connectorFor ?? getConnector)(src.connector_key);
  if (!connector) return { kind: "skipped", reason: `no_connector_${src.connector_key}` };

  // Exactly-once per window: the unique index rejects a concurrent or repeated run.
  let runId: string;
  try {
    runId = (await db.query<{ id: string }>(`INSERT INTO ingestion_runs (source_id, job_type, correlation_id, window_key) VALUES ($1,$2,$3,$4) RETURNING id`,
      [src.id, job.jobType, correlationId, job.window ? job.window : null])).rows[0]!.id;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") { log("run_skipped_duplicate_window", { window: job.window }); return { kind: "skipped", reason: "duplicate_window" }; }
    throw e;
  }
  const startedAt = now();
  await db.query(`UPDATE sources SET last_attempt_at=$2 WHERE id=$1`, [src.id, startedAt]);
  log("run_started", { connector: connector.key, parserVersion: connector.parserVersion });

  const ctx: ConnectorContext = {
    sourceId: src.id, sourceKey: src.key, config: src.config, now: startedAt, log: (e, d) => log(e, d ?? {}),
    http: (deps.httpFor ?? ((s) => createPoliteHttp({ ratePerMinute: s.rate_limit_per_minute })))(src),
  };
  const stats = { refs: 0, fetched: 0, notModified: 0, candidates: 0, created: 0, updated: 0, unchanged: 0, attached: 0, rejected: 0, missing: 0 };
  let failure: Failure | null = null;
  const seenKeys = new Set<string>();
  let completeListing = connector.capabilities.discovery;

  try {
    for await (const ref of connector.discover(ctx)) {
      stats.refs++;
      const state = (await db.query(`SELECT etag, last_modified FROM fetch_state WHERE source_id=$1 AND url=$2`, [src.id, ref.url])).rows[0];
      const res: FetchResult = await connector.fetch(ref, ctx, connector.capabilities.conditionalRequests ? { etag: state?.etag, lastModified: state?.last_modified } : undefined);
      if (res.kind === "ok") {
        stats.fetched++;
        const rawSha = await storeRawPayload(db, res.body, res.contentType);
        await db.query(`INSERT INTO fetch_state (source_id, url, etag, last_modified, last_raw_sha256, updated_at) VALUES ($1,$2,$3,$4,$5,now())
                        ON CONFLICT (source_id, url) DO UPDATE SET etag=EXCLUDED.etag, last_modified=EXCLUDED.last_modified, last_raw_sha256=EXCLUDED.last_raw_sha256, updated_at=now()`,
          [src.id, ref.url, res.etag, res.lastModified, rawSha]);
        let candidates;
        try {
          candidates = await connector.normalize(await connector.parse(res, ctx), ctx);
        } catch (e) {
          failure = { retryable: false, reason: `parse_failure: ${(e as Error).message}` };
          break;
        }
        for (const c of candidates) {
          stats.candidates++;
          const o = await ingestCandidate(db, { source: src, candidate: c, parserVersion: connector.parserVersion, rawSha256: rawSha, fetchedAt: res.fetchedAt });
          seenKeys.add(c.externalId ?? `url:${sha256(normalizeUrl(c.url))}`);
          stats[o.kind]++;
          if (o.kind === "rejected") log("candidate_rejected", { reason: o.reason, externalId: c.externalId });
        }
      } else if (res.kind === "not_modified") {
        stats.notModified++;
        completeListing = false; // unchanged feed: nothing went missing
        // 304 = the source confirmed nothing changed: a successful check (Invariant 3 allows success to advance).
        await db.query(`UPDATE events e SET last_checked_at=$2, last_success_at=$2 FROM source_records sr
                        WHERE sr.event_id=e.id AND sr.source_id=$1 AND sr.record_status='active'`, [src.id, res.fetchedAt]);
      } else if (res.kind === "missing") {
        if (connector.capabilities.discovery) { failure = { retryable: false, reason: `listing/feed returned HTTP ${res.status}` }; break; }
        // Page-per-event connectors: the event page is gone → source_missing + review (never cancelled).
        const rec = (await db.query(`SELECT external_key FROM source_records WHERE source_id=$1 AND url=$2`, [src.id, ref.url])).rows[0];
        if (rec) { await markRecordMissing(db, src.id, rec.external_key, res.status, res.fetchedAt); stats.missing++; }
      } else if (res.kind === "rate_limited") {
        failure = { retryable: true, reason: "rate_limited (429/503)", retryAfterMs: res.retryAfterMs };
        break;
      } else if (res.kind === "disallowed") {
        failure = { retryable: false, reason: `access not permitted: ${res.reason}` };
        break;
      } else {
        failure = { retryable: true, reason: res.error };
        break;
      }
    }
  } catch (e) {
    failure = { retryable: true, reason: (e as Error).message };
  }

  if (!failure && completeListing && stats.fetched > 0) {
    // A complete listing no longer contains a record we had → source_missing + review (Invariant 4).
    const gone = await db.query<{ external_key: string }>(`SELECT external_key FROM source_records WHERE source_id=$1 AND record_status='active' AND NOT (external_key = ANY($2))`, [src.id, [...seenKeys]]);
    for (const g of gone.rows) { await markRecordMissing(db, src.id, g.external_key, 404, startedAt, "No longer listed in the source's feed"); stats.missing++; }
  }

  if (!failure) {
    await db.query(`UPDATE sources SET last_success_at=$2::timestamptz, consecutive_failures=0, circuit_open_until=NULL, next_scheduled_at=$2::timestamptz + make_interval(mins => refresh_cadence_minutes) WHERE id=$1`, [src.id, now()]);
    await db.query(`UPDATE ingestion_runs SET status='succeeded', finished_at=now(), stats=$2 WHERE id=$1`, [runId, JSON.stringify(stats)]);
    log("run_succeeded", stats);
    return { kind: "succeeded", stats };
  }

  // ---------- failure path: freshness untouched (Invariant 3) ----------
  const failures = src.consecutive_failures + 1;
  const threshold = deps.failureAlertThreshold ?? 5;
  const circuitMs = failures >= threshold ? Math.min(24 * 3600_000, 2 ** (failures - threshold) * 3600_000) : 0;
  await db.query(
    `UPDATE sources SET consecutive_failures=$2, last_errors=(jsonb_build_array(jsonb_build_object('at',$3::text,'error',$4::text,'correlationId',$5::text)) || last_errors) - 10,
       circuit_open_until = CASE WHEN $6::bigint > 0 THEN $3::timestamptz + make_interval(secs => $6::bigint / 1000) ELSE circuit_open_until END
     WHERE id=$1`, [src.id, failures, startedAt.toISOString(), failure.reason, correlationId, circuitMs]);
  const evs = await db.query<{ event_id: string }>(`SELECT DISTINCT event_id FROM source_records WHERE source_id=$1 AND record_status='active' AND event_id IS NOT NULL`, [src.id]);
  for (const e of evs.rows) await markEventCheckFailed(db, e.event_id, startedAt);
  await db.query(`UPDATE ingestion_runs SET status='failed', finished_at=now(), stats=$2, error=$3 WHERE id=$1`, [runId, JSON.stringify(stats), failure.reason]);
  log("run_failed", { reason: failure.reason, consecutiveFailures: failures });
  reportError(new Error(failure.reason), { sourceId: src.id, correlationId });
  if (failures >= threshold) {
    (deps.onAlert ?? ((m, d) => log("alert", { message: m, ...d })))(`Source ${src.key} failed ${failures} times in a row`, { sourceId: src.id, lastError: failure.reason });
    await openReview(db, { kind: "failed_source", sourceId: src.id, reason: `${failures} consecutive failures: ${failure.reason}` });
  }

  const attempt = job.attempt ?? 1;
  if (!failure.retryable) return { kind: "failed", reason: failure.reason };
  if (attempt >= MAX_ATTEMPTS) {
    await db.query(`INSERT INTO dead_letters (queue, payload, attempts, last_error, correlation_id) VALUES ($1,$2,$3,$4,$5)`, [job.jobType, JSON.stringify(job), attempt, failure.reason, correlationId]);
    await deps.queue.send(DEAD_LETTER, { ...job, lastError: failure.reason });
    log("dead_lettered", { attempts: attempt });
    return { kind: "dead_lettered", reason: failure.reason };
  }
  const jitter = fullJitterDelayMs(attempt, RETRY_BASE_MS, RETRY_CAP_MS, deps.rand);
  const delayMs = failure.retryAfterMs != null ? Math.max(failure.retryAfterMs, jitter) : jitter;
  if (failure.retryAfterMs != null) await db.query(`UPDATE sources SET next_scheduled_at=$2 WHERE id=$1`, [src.id, new Date(startedAt.getTime() + delayMs)]);
  await deps.queue.send(job.jobType === "deadline-check" ? "refresh" : job.jobType, { ...job, attempt: attempt + 1, correlationId, window: job.window ? `${job.window}:retry${attempt}` : null },
    { startAfterSeconds: Math.ceil(delayMs / 1000), singletonKey: `${job.jobType}:${src.id}:${job.window ?? "adhoc"}:retry${attempt}` });
  log("retry_scheduled", { delayMs, retryAfterMs: failure.retryAfterMs ?? null });
  return { kind: "retry_scheduled", delayMs, reason: failure.reason };
}
