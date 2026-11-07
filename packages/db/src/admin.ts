import type pg from "pg";
import { withTx, type Tx } from "./client";
import { refreshVerification } from "./ingest";

/** Append-only audit log for every admin action. */
export async function audit(db: pg.Pool | Tx, actor: string, action: string, targetType: string | null, targetId: string | null, details: unknown = {}) {
  await db.query(`INSERT INTO audit_log (actor, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)`, [actor, action, targetType, targetId, JSON.stringify(details)]);
}

/** Merge `mergedId` into `survivorId`. All source records and provenance are kept; reversible. */
export async function mergeEvents(db: pg.Pool, survivorId: string, mergedId: string, actor: string, method: "auto" | "admin" = "admin", score: number | null = null) {
  if (survivorId === mergedId) throw new Error("cannot merge an event into itself");
  return withTx(db, async (tx) => {
    const m = (await tx.query(`SELECT publish_state, edition_id FROM events WHERE id=$1 FOR UPDATE`, [mergedId])).rows[0];
    const s = (await tx.query(`SELECT edition_id FROM events WHERE id=$1 FOR UPDATE`, [survivorId])).rows[0];
    if (!m || !s) throw new Error("event not found");
    if (m.publish_state === "merged") throw new Error("already merged");
    if (m.edition_id && s.edition_id && m.edition_id !== s.edition_id) throw new Error("different editions are never merged");
    const moved = (await tx.query<{ id: string }>(`UPDATE source_records SET event_id=$1, original_event_id=COALESCE(original_event_id, $2) WHERE event_id=$2 RETURNING id`, [survivorId, mergedId])).rows.map((r) => r.id);
    await tx.query(`INSERT INTO field_provenance (event_id, field, source_record_id, value, observed_at)
                    SELECT $1, field, source_record_id, value, observed_at FROM field_provenance WHERE event_id=$2 ON CONFLICT DO NOTHING`, [survivorId, mergedId]);
    await tx.query(`UPDATE events SET publish_state='merged', merged_into_id=$1, updated_at=now() WHERE id=$2`, [survivorId, mergedId]);
    await tx.query(`UPDATE favorites f SET event_id=$1 WHERE event_id=$2 AND NOT EXISTS (SELECT 1 FROM favorites g WHERE g.user_id=f.user_id AND g.event_id=$1)`, [survivorId, mergedId]);
    const [a, b] = [survivorId, mergedId].sort();
    await tx.query(`UPDATE dedup_candidates SET status='merged', decided_at=now() WHERE event_a=$1 AND event_b=$2`, [a, b]);
    const id = (await tx.query<{ id: string }>(`INSERT INTO merges (survivor_id, merged_id, score, method, actor, moved_source_record_ids, prior_publish_state) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [survivorId, mergedId, score, method, actor, moved, m.publish_state])).rows[0]!.id;
    await refreshVerification(tx, survivorId);
    await audit(tx, actor, "merge_events", "event", survivorId, { mergedId, moved, mergeId: id });
    return id;
  });
}

export async function unmergeEvents(db: pg.Pool, mergeId: string, actor: string) {
  return withTx(db, async (tx) => {
    const m = (await tx.query(`SELECT * FROM merges WHERE id=$1 AND undone_at IS NULL FOR UPDATE`, [mergeId])).rows[0];
    if (!m) throw new Error("merge not found or already undone");
    await tx.query(`UPDATE events SET publish_state=$2, merged_into_id=NULL, updated_at=now() WHERE id=$1`, [m.merged_id, m.prior_publish_state]);
    await tx.query(`UPDATE source_records SET event_id=$1 WHERE id = ANY($2)`, [m.merged_id, m.moved_source_record_ids]);
    await tx.query(`DELETE FROM field_provenance WHERE event_id=$1 AND source_record_id = ANY($2)`, [m.survivor_id, m.moved_source_record_ids]);
    await tx.query(`UPDATE merges SET undone_at=now() WHERE id=$1`, [mergeId]);
    const [a, b] = [m.survivor_id, m.merged_id].sort();
    await tx.query(`UPDATE dedup_candidates SET status='pending', decided_at=NULL WHERE event_a=$1 AND event_b=$2`, [a, b]);
    await refreshVerification(tx, m.survivor_id);
    await refreshVerification(tx, m.merged_id);
    await audit(tx, actor, "unmerge_events", "merge", mergeId, { survivor: m.survivor_id, restored: m.merged_id });
  });
}

/**
 * Moderator publishes a reviewed event. The deferred trigger enforces a supporting source URL
 * (Invariant 6). A moderator who checked the sources may mark it admin_verified.
 */
export async function publishEvent(db: pg.Pool, eventId: string, actor: string, opts: { adminVerified?: boolean; sourceUrl?: string | null } = {}) {
  return withTx(db, async (tx) => {
    const e = (await tx.query(`SELECT id, sport_scope, is_synthetic FROM events WHERE id=$1 FOR UPDATE`, [eventId])).rows[0];
    if (!e) throw new Error("event not found");
    if (opts.sourceUrl) {
      if (!/^https?:\/\//.test(opts.sourceUrl)) throw new Error("source URL must be http(s)");
      const sub = (await tx.query(`SELECT id FROM sources WHERE key='organizer-submissions'`)).rows[0];
      await tx.query(`INSERT INTO source_records (source_id, external_key, url, event_id, original_event_id, parser_version, content_hash, normalized, is_synthetic)
                      VALUES ($1, 'moderator:' || $2::text || ':' || md5($3), $3, $2::uuid, $2::uuid, 'manual', md5($3), '{}', $4) ON CONFLICT DO NOTHING`, [sub.id, eventId, opts.sourceUrl, e.is_synthetic]);
    }
    if (e.sport_scope === "unknown") await tx.query(`UPDATE events SET sport_scope='flag' WHERE id=$1`, [eventId]); // moderator confirmed flag scope
    await tx.query(`UPDATE events SET publish_state='published', verification_level = CASE WHEN $2 THEN 'admin_verified'::verification_level ELSE verification_level END, updated_at=now() WHERE id=$1`, [eventId, !!opts.adminVerified]);
    await tx.query(`UPDATE submissions SET status='published', updated_at=now() WHERE event_id=$1`, [eventId]);
    await tx.query(`UPDATE review_items SET status='resolved', resolved_at=now(), resolved_by=$2 WHERE event_id=$1 AND status='open' AND kind IN ('submission','ambiguous_extraction')`, [eventId, actor]);
    await tx.query(`UPDATE sources SET published_count = published_count + 1 WHERE key='organizer-submissions' AND EXISTS (SELECT 1 FROM submissions WHERE event_id=$1)`, [eventId]);
    await audit(tx, actor, "publish_event", "event", eventId, { adminVerified: !!opts.adminVerified, sourceUrl: opts.sourceUrl ?? null });
  });
}

export async function rejectEvent(db: pg.Pool, eventId: string, actor: string, reason: string) {
  return withTx(db, async (tx) => {
    await tx.query(`UPDATE events SET publish_state='rejected', updated_at=now() WHERE id=$1`, [eventId]);
    await tx.query(`UPDATE submissions SET status='rejected', rejection_reason=$2, updated_at=now() WHERE event_id=$1`, [eventId, reason]);
    await tx.query(`UPDATE review_items SET status='resolved', resolved_at=now(), resolved_by=$2 WHERE event_id=$1 AND status='open'`, [eventId, actor]);
    await audit(tx, actor, "reject_event", "event", eventId, { reason });
  });
}

/** Moderator edits to reviewed fields; logged as human changes. */
export async function moderatorEdit(db: pg.Pool, eventId: string, actor: string, patch: { name?: string; startDate?: string | null; endDate?: string | null; registrationUrl?: string | null; sportScope?: string }) {
  return withTx(db, async (tx) => {
    const cur = (await tx.query(`SELECT name, start_date, end_date, registration_url, sport_scope FROM events WHERE id=$1 FOR UPDATE`, [eventId])).rows[0];
    if (!cur) throw new Error("event not found");
    const next = { name: patch.name ?? cur.name, start_date: patch.startDate !== undefined ? patch.startDate : cur.start_date, end_date: patch.endDate !== undefined ? patch.endDate : cur.end_date,
      registration_url: patch.registrationUrl !== undefined ? patch.registrationUrl : cur.registration_url, sport_scope: patch.sportScope ?? cur.sport_scope };
    if (next.registration_url && !/^https?:\/\//.test(next.registration_url)) throw new Error("registration URL must be http(s)");
    await tx.query(`UPDATE events SET name=$2, start_date=$3, end_date=COALESCE($4,$3), registration_url=$5, sport_scope=$6, date_precision=CASE WHEN $3::date IS NULL THEN 'tbd'::date_precision ELSE 'day'::date_precision END, updated_at=now() WHERE id=$1`,
      [eventId, next.name, next.start_date, next.end_date, next.registration_url, next.sport_scope]);
    for (const k of Object.keys(next) as (keyof typeof next)[]) {
      if (String(next[k] ?? "") !== String(cur[k] ?? "")) await tx.query(`INSERT INTO event_changes (event_id, field, old_value, new_value, material, actor) VALUES ($1,$2,$3,$4,true,$5)`, [eventId, k, JSON.stringify(cur[k]), JSON.stringify(next[k]), `moderator:${actor}`]);
    }
    await audit(tx, actor, "edit_event", "event", eventId, patch);
  });
}
