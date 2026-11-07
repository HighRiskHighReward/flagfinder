import type pg from "pg";
import { getConnector } from "@ff/connectors";
import { ingestCandidate, openReview } from "@ff/db";
import type { JobQueue } from "./queue";
import type { Logger } from "./log";

/** deadline-check: prioritize re-checking sources whose events start or close within 30 days. */
export async function deadlineCheck(db: pg.Pool, queue: JobQueue, log: Logger, now = new Date()) {
  const r = await db.query<{ source_id: string }>(
    `SELECT DISTINCT sr.source_id FROM source_records sr JOIN events e ON e.id=sr.event_id JOIN sources s ON s.id=sr.source_id
     WHERE e.publish_state='published' AND sr.record_status='active' AND s.status='enabled' AND NOT s.paused
       AND (e.start_date BETWEEN current_date AND current_date + 30 OR e.registration_deadline BETWEEN current_date AND current_date + 30)`);
  const window = `deadline:${now.toISOString().slice(0, 13)}`;
  for (const row of r.rows) await queue.send("refresh", { sourceId: row.source_id, jobType: "deadline-check", window }, { singletonKey: `deadline:${row.source_id}:${window}`, priority: 90 });
  log("deadline_check_planned", { sources: r.rowCount });
  return r.rowCount ?? 0;
}

/** review-sweep: surface stale, failed and source-missing records; mark finished events completed. */
export async function reviewSweep(db: pg.Pool, log: Logger) {
  const staleHours = Number((await db.query(`SELECT value FROM app_settings WHERE key='stale_after_hours'`)).rows[0]?.value ?? 72);
  const stale = await db.query<{ id: string }>(
    `SELECT id FROM events WHERE publish_state='published' AND NOT is_synthetic AND end_date >= current_date
       AND (last_success_at IS NULL OR last_success_at < now() - make_interval(hours => $1))`, [staleHours]);
  for (const e of stale.rows) await openReview(db, { kind: "stale", eventId: e.id, reason: `No successful check in ${staleHours}h` });
  const missing = await db.query<{ id: string }>(`SELECT id FROM events WHERE status='source_missing' AND publish_state='published'`);
  for (const e of missing.rows) await openReview(db, { kind: "source_missing", eventId: e.id, reason: "Listing not found at source" });
  const failing = await db.query<{ id: string; consecutive_failures: number }>(`SELECT id, consecutive_failures FROM sources WHERE consecutive_failures >= 3`);
  for (const s of failing.rows) await openReview(db, { kind: "failed_source", sourceId: s.id, reason: `${s.consecutive_failures} consecutive failures` });
  // Dates are facts: an event whose last day has passed is completed (status, not a guess about cancellation).
  const done = await db.query(`UPDATE events SET status='completed', updated_at=now() WHERE status='scheduled' AND end_date < current_date - 1 RETURNING id`);
  log("review_sweep", { stale: stale.rowCount, sourceMissing: missing.rowCount, failingSources: failing.rowCount, completed: done.rowCount });
  return { stale: stale.rowCount ?? 0, missing: missing.rowCount ?? 0, failing: failing.rowCount ?? 0, completed: done.rowCount ?? 0 };
}

/**
 * Re-parse stored raw payloads after a parser version bump — no re-fetching. Same external keys
 * → updates, never duplicates.
 */
export async function reparseSource(db: pg.Pool, sourceId: string, log: Logger, now = new Date()) {
  const src = (await db.query(`SELECT * FROM sources WHERE id=$1`, [sourceId])).rows[0];
  const connector = src && getConnector(src.connector_key);
  if (!connector) return { reparsed: 0 };
  const raws = await db.query<{ url: string; body: string; content_type: string | null; sha256: string }>(
    `SELECT fs.url, rp.body, rp.content_type, rp.sha256 FROM fetch_state fs JOIN raw_payloads rp ON rp.sha256=fs.last_raw_sha256 WHERE fs.source_id=$1`, [sourceId]);
  let n = 0;
  for (const r of raws.rows) {
    const ctx = { config: src.config, now };
    const cands = await connector.normalize(await connector.parse({ kind: "ok", url: r.url, status: 200, contentType: r.content_type, body: r.body, etag: null, lastModified: null, fetchedAt: now }, ctx), ctx);
    for (const c of cands) { await ingestCandidate(db, { source: src, candidate: c, parserVersion: connector.parserVersion, rawSha256: r.sha256, fetchedAt: now }); n++; }
  }
  await db.query(`UPDATE sources SET parser_version=$2 WHERE id=$1`, [sourceId, connector.parserVersion]);
  log("reparse_done", { sourceId, candidates: n, parserVersion: connector.parserVersion });
  return { reparsed: n };
}
