import {
  candidateSchema, classifySportScope, computeVerification, DEFAULT_THRESHOLDS, detectStatusSignal, diffSnapshots,
  isCandidatePair, isPublishableScope, materialHash, nextStatus, normalizeUrl, scorePair, sha256, slugify, zonedTimeToUtc,
  type CandidateInput, type DedupEventView, type DedupThresholds, type EventStatus, type NormalizedCandidate, type SportScope,
  type VerificationLevel,
} from "@ff/core";
import type pg from "pg";
import { withTx, type Tx } from "./client";
import { candidateSnapshot, type Snapshot } from "./snapshot";

export interface SourceRow {
  id: string;
  key: string;
  status: string;
  is_synthetic: boolean;
}

export interface IngestInput {
  source: SourceRow;
  candidate: CandidateInput;
  parserVersion: string;
  rawSha256?: string | null;
  fetchedAt?: Date;
  /** Auto-publish when the candidate is clean. Submissions pass false (moderation first). */
  autoPublish?: boolean;
}

export type IngestOutcome =
  | { kind: "created"; eventId: string; published: boolean; review: string[] }
  | { kind: "updated"; eventId: string; changes: number; material: boolean; review: string[] }
  | { kind: "unchanged"; eventId: string }
  | { kind: "attached"; eventId: string; score: number }
  | { kind: "rejected"; reason: string };

export async function storeRawPayload(db: pg.Pool | Tx, body: string, contentType: string | null): Promise<string> {
  const hash = sha256(body);
  await db.query(
    `INSERT INTO raw_payloads (sha256, content_type, body, byte_size) VALUES ($1,$2,$3,$4) ON CONFLICT (sha256) DO NOTHING`,
    [hash, contentType, body, Buffer.byteLength(body)],
  );
  return hash;
}

async function thresholds(tx: Tx): Promise<DedupThresholds> {
  const r = await tx.query<{ value: { auto_merge: number; review: number } }>(`SELECT value FROM app_settings WHERE key='dedup_thresholds'`);
  const v = r.rows[0]?.value;
  return v ? { autoMerge: v.auto_merge, review: v.review } : DEFAULT_THRESHOLDS;
}

export async function ingestCandidate(db: pg.Pool, input: IngestInput): Promise<IngestOutcome> {
  const parsed = candidateSchema.safeParse(input.candidate);
  if (!parsed.success) {
    return { kind: "rejected", reason: `schema: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  }
  const c = parsed.data;
  return withTx(db, (tx) => ingestValidated(tx, input, c));
}

async function ingestValidated(tx: Tx, input: IngestInput, c: NormalizedCandidate): Promise<IngestOutcome> {
  const { source } = input;
  const now = input.fetchedAt ?? new Date();
  const externalKey = c.externalId ?? `url:${sha256(normalizeUrl(c.url))}`;
  const scope: SportScope = c.sportScope !== "unknown" ? c.sportScope : classifySportScope(`${c.name} ${c.description ?? ""}`);
  const flagDivisions = c.divisions.filter((d) => d.sportScope === "flag" || d.sportScope === "unknown");
  const candidate: NormalizedCandidate = scope === "mixed" ? { ...c, divisions: flagDivisions } : c;

  const existing = await tx.query<{ id: string; event_id: string | null; content_hash: string }>(
    `SELECT id, event_id, content_hash FROM source_records WHERE source_id=$1 AND external_key=$2 FOR UPDATE`,
    [source.id, externalKey],
  );
  const recordHash = sha256(JSON.stringify(candidate));

  // Upsert the source record first: everything we ingest is traceable to it.
  const sr = await tx.query<{ id: string }>(
    `INSERT INTO source_records (source_id, external_key, external_id, url, raw_sha256, parser_version, content_hash, normalized, is_synthetic, last_seen_at, record_status, missing_since)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',NULL)
     ON CONFLICT (source_id, external_key) DO UPDATE SET url=EXCLUDED.url, raw_sha256=COALESCE(EXCLUDED.raw_sha256, source_records.raw_sha256),
       parser_version=EXCLUDED.parser_version, content_hash=EXCLUDED.content_hash, normalized=EXCLUDED.normalized, last_seen_at=EXCLUDED.last_seen_at,
       record_status=CASE WHEN source_records.record_status='rejected' THEN 'rejected' ELSE 'active' END, missing_since=NULL
     RETURNING id`,
    [source.id, externalKey, c.externalId, c.url, input.rawSha256 ?? null, input.parserVersion, recordHash, JSON.stringify(candidate), source.is_synthetic, now],
  );
  const sourceRecordId = sr.rows[0]!.id;

  if (!isPublishableScope(scope)) {
    await tx.query(`UPDATE source_records SET record_status='rejected' WHERE id=$1`, [sourceRecordId]);
    if (!existing.rows[0]) await tx.query(`UPDATE sources SET rejected_count = rejected_count + 1 WHERE id=$1`, [source.id]);
    return { kind: "rejected", reason: `out_of_scope:${scope}` };
  }

  const prior = existing.rows[0];
  if (prior?.event_id) {
    return updateExisting(tx, prior.event_id, sourceRecordId, candidate, input, now);
  }

  // New record. Try to attach to an existing event (cross-source dedup).
  const dedup = await findDuplicate(tx, candidate, source.is_synthetic);
  if (dedup && dedup.decision === "auto_merge") {
    await tx.query(`UPDATE source_records SET event_id=$1 WHERE id=$2`, [dedup.eventId, sourceRecordId]);
    await recordProvenance(tx, dedup.eventId, sourceRecordId, candidateSnapshot(candidate, "scheduled"), now);
    await detectConflicts(tx, dedup.eventId, sourceRecordId, candidate);
    await refreshVerification(tx, dedup.eventId);
    await tx.query(`UPDATE events SET last_checked_at=$2, last_success_at=$2 WHERE id=$1`, [dedup.eventId, now]);
    await tx.query(`UPDATE sources SET discovered_count = discovered_count + 1 WHERE id=$1`, [source.id]);
    return { kind: "attached", eventId: dedup.eventId, score: dedup.score };
  }

  const review: string[] = [];
  if (candidate.ambiguities.length) review.push("ambiguous_extraction");
  if (!candidate.startDate) review.push("missing_date");
  if (dedup?.decision === "review") review.push("dedup");
  if (source.status !== "enabled" && !source.is_synthetic) review.push("source_not_enabled");
  const publish = (input.autoPublish ?? true) && review.length === 0;

  const eventId = await insertEvent(tx, candidate, scope, source.is_synthetic, publish ? "published" : "in_review", now);
  await tx.query(`UPDATE source_records SET event_id=$1, original_event_id=$1 WHERE id=$2`, [eventId, sourceRecordId]);
  await writeChildren(tx, eventId, candidate, source.is_synthetic);
  await recordProvenance(tx, eventId, sourceRecordId, candidateSnapshot(candidate, "scheduled"), now);
  await refreshVerification(tx, eventId);
  await tx.query(`UPDATE sources SET discovered_count = discovered_count + 1, published_count = published_count + $2 WHERE id=$1`, [source.id, publish ? 1 : 0]);

  if (candidate.ambiguities.length) {
    await openReview(tx, { kind: "ambiguous_extraction", eventId, sourceId: source.id, reason: candidate.ambiguities.map((a) => `${a.field}: ${a.reason}`).join("; "), payload: { ambiguities: candidate.ambiguities } });
  }
  if (dedup?.decision === "review") {
    const [a, b] = [eventId, dedup.eventId].sort();
    await tx.query(`INSERT INTO dedup_candidates (event_a, event_b, score, features) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [a, b, dedup.score, JSON.stringify(dedup.features)]);
    await openReview(tx, { kind: "dedup", eventId, refId: dedup.eventId, reason: `Possible duplicate (score ${dedup.score})`, payload: dedup.features });
  }
  return { kind: "created", eventId, published: publish, review };
}

async function insertEvent(tx: Tx, c: NormalizedCandidate, scope: SportScope, synthetic: boolean, state: string, now: Date): Promise<string> {
  const organizerId = c.organizer ? await upsertOrganizer(tx, c.organizer.name, c.organizer.websiteUrl, synthetic) : null;
  let seriesId: string | null = null, editionId: string | null = null;
  if (c.series) {
    const s = await tx.query<{ id: string }>(`SELECT id FROM event_series WHERE lower(name)=lower($1) AND organizer_id IS NOT DISTINCT FROM $2 AND is_synthetic=$3 LIMIT 1`, [c.series.name, organizerId, synthetic]);
    seriesId = s.rows[0]?.id ?? (await tx.query<{ id: string }>(`INSERT INTO event_series (name, organizer_id, is_synthetic) VALUES ($1,$2,$3) RETURNING id`, [c.series.name, organizerId, synthetic])).rows[0]!.id;
    const e = await tx.query<{ id: string }>(
      `INSERT INTO event_editions (series_id, label, season_year, is_synthetic) VALUES ($1,$2,$3,$4)
       ON CONFLICT (series_id, label) DO UPDATE SET label=EXCLUDED.label RETURNING id`,
      [seriesId, c.series.editionLabel, c.startDate ? +c.startDate.slice(0, 4) : null, synthetic],
    );
    editionId = e.rows[0]!.id;
  }
  const signal = detectStatusSignal({ schemaEventStatus: c.statusSignal.schemaEventStatus, text: c.statusSignal.text });
  const st = nextStatus("scheduled", signal);
  const snap = candidateSnapshot(c, st.status);
  const slugBase = slugify(`${c.name} ${c.startDate?.slice(0, 4) ?? ""}`) || "event";
  const r = await tx.query<{ id: string }>(
    `INSERT INTO events (slug, name, organizer_id, series_id, edition_id, event_type, sport_scope, season, start_date, end_date, start_at, end_at, timezone,
       date_precision, time_known, status, status_evidence, registration_url, registration_deadline, registration_deadline_status, registration_status,
       description, verification_level, publish_state, is_synthetic, discovered_at, updated_at, last_checked_at, last_success_at, source_updated_at,
       last_material_change_at, content_hash)
     VALUES ($1 || '-' || substr(md5(random()::text),1,6), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'discovered_unverified',$23,$24,$25,$25,$25,$25,$26,$25,$27)
     RETURNING id`,
    [slugBase, c.name, organizerId, seriesId, editionId, c.eventType, scope, c.season, c.startDate, c.endDate ?? c.startDate,
      c.startDate && c.startTime ? zonedTimeToUtc(c.startDate, c.startTime, c.timezone) : null,
      (c.endDate ?? c.startDate) && c.endTime ? zonedTimeToUtc((c.endDate ?? c.startDate)!, c.endTime, c.timezone) : null,
      c.timezone, c.datePrecision, !!c.startTime, st.status, st.evidence, c.registrationUrl, c.registrationDeadline,
      c.registrationDeadline ? "known" : "unknown", c.registrationStatus, c.description, state, synthetic, now, c.sourceUpdatedAt, materialHash(snap)],
  );
  return r.rows[0]!.id;
}

async function upsertOrganizer(tx: Tx, name: string, website: string | null, synthetic: boolean): Promise<string> {
  const f = await tx.query<{ id: string }>(`SELECT id FROM organizers WHERE lower(name)=lower($1) AND is_synthetic=$2 LIMIT 1`, [name, synthetic]);
  if (f.rows[0]) return f.rows[0].id;
  return (await tx.query<{ id: string }>(`INSERT INTO organizers (name, website_url, is_synthetic) VALUES ($1,$2,$3) RETURNING id`, [name, website, synthetic])).rows[0]!.id;
}

async function writeChildren(tx: Tx, eventId: string, c: NormalizedCandidate, synthetic: boolean) {
  await tx.query(`DELETE FROM event_venues WHERE event_id=$1`, [eventId]);
  let first = true;
  for (const v of c.venues) {
    const found = await tx.query<{ id: string }>(
      // Same name alone is not enough ("Central Park" exists in many cities): require same locality and
      // address, and when both sides have coordinates, that they are within 250 m.
      `SELECT id FROM venues WHERE lower(name)=lower($1) AND coalesce(lower(address_line1),'')=coalesce(lower($2),'') AND country_code=$3 AND is_synthetic=$4
         AND coalesce(lower(locality),'')=coalesce(lower($5),'')
         AND (location IS NULL) = ($6::float8 IS NULL)
         AND ($6::float8 IS NULL OR ST_DWithin(location, ST_SetSRID(ST_MakePoint($7::float8,$6::float8),4326)::geography, 250))
       LIMIT 1`,
      [v.name, v.addressLine1, v.countryCode, synthetic, v.locality, v.lat, v.lon],
    );
    let venueId = found.rows[0]?.id;
    if (!venueId) {
      venueId = (await tx.query<{ id: string }>(
        `INSERT INTO venues (name, address_line1, locality, admin_area, postal_code, country_code, location, geo_precision, geocode_provider, geocode_license, indoor_outdoor, is_synthetic)
         VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $7::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($8::float8,$7::float8),4326)::geography END, $9,$10,$11,$12,$13) RETURNING id`,
        [v.name, v.addressLine1, v.locality, v.adminArea, v.postalCode, v.countryCode, v.lat, v.lon, v.geoPrecision, v.geocodeProvider, v.geocodeLicense, v.indoorOutdoor, synthetic],
      )).rows[0]!.id;
    }
    await tx.query(`INSERT INTO event_venues (event_id, venue_id, is_primary) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [eventId, venueId, first]);
    first = false;
  }
  await tx.query(`DELETE FROM divisions WHERE event_id=$1`, [eventId]);
  for (const d of c.divisions) {
    const r = await tx.query<{ id: string }>(
      `INSERT INTO divisions (event_id, name, sport_scope, gender_category, gender_label_original, level_category, age_rule_type, age_min, age_max,
         birth_year_min, birth_year_max, grade_min, grade_max, age_cutoff_date, eligibility_original, format, contact_classification, rulebook_url,
         competition_level, game_guarantee, fee_status, fee_amount_minor, fee_currency, pricing_basis, capacity_status, capacity_teams)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) RETURNING id`,
      [eventId, d.name, d.sportScope === "unknown" ? "flag" : d.sportScope, d.genderCategory, d.genderLabelOriginal, d.levelCategory, d.ageRuleType, d.ageMin, d.ageMax,
        d.birthYearMin, d.birthYearMax, d.gradeMin, d.gradeMax, d.ageCutoffDate, d.eligibilityOriginal, d.format, d.contactClassification, d.rulebookUrl,
        d.competitionLevel, d.gameGuarantee, d.feeAmountMinor === null ? "unknown" : "known", d.feeAmountMinor, d.feeCurrency, d.pricingBasis,
        d.capacityTeams === null ? "unknown" : "known", d.capacityTeams],
    );
    for (const f of d.extraFees) {
      await tx.query(`INSERT INTO division_extra_fees (division_id, label, amount_minor, currency, pricing_basis, mandatory) VALUES ($1,$2,$3,$4,$5,$6)`, [r.rows[0]!.id, f.label, f.amountMinor, f.currency, f.pricingBasis, f.mandatory]);
    }
  }
  await tx.query(`DELETE FROM league_sessions WHERE event_id=$1`, [eventId]);
  for (const s of c.sessions) {
    await tx.query(`INSERT INTO league_sessions (event_id, name, start_date, end_date, game_days, practice_schedule) VALUES ($1,$2,$3,$4,$5,$6)`, [eventId, s.name, s.startDate, s.endDate, s.gameDays, s.practiceSchedule]);
  }
}

/** Current snapshot of an event as stored, for diffing. */
export async function loadEventSnapshot(tx: Tx | pg.Pool, eventId: string): Promise<Snapshot & { _status: EventStatus }> {
  const e = (await tx.query(`SELECT * FROM events WHERE id=$1`, [eventId])).rows[0];
  const venues = (await tx.query(
    `SELECT v.name, v.address_line1 AS address, v.locality, v.postal_code AS postal, v.country_code AS country,
            ST_Y(v.location::geometry) AS lat, ST_X(v.location::geometry) AS lon
     FROM event_venues ev JOIN venues v ON v.id=ev.venue_id WHERE ev.event_id=$1`, [eventId])).rows
    .map((v) => ({ name: v.name, address: v.address, locality: v.locality, postal: v.postal, country: v.country, lat: v.lat, lon: v.lon }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const divisions = (await tx.query(`SELECT * FROM divisions WHERE event_id=$1`, [eventId])).rows
    .map((d) => ({ name: d.name, gender: d.gender_category, level: d.level_category, rule: d.age_rule_type, min: d.age_min, max: d.age_max, cutoff: d.age_cutoff_date, by: [d.birth_year_min, d.birth_year_max], format: d.format, fee: d.fee_amount_minor, cur: d.fee_currency, basis: d.pricing_basis }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const sessions = (await tx.query(`SELECT name, start_date, end_date FROM league_sessions WHERE event_id=$1 ORDER BY start_date`, [eventId])).rows.map((s) => [s.name, s.start_date, s.end_date]);
  return {
    _status: e.status,
    name: e.name, start_date: e.start_date, end_date: e.end_date, start_at: e.start_at ? new Date(e.start_at).toISOString() : null, timezone: e.timezone,
    status: e.status, venues, registration_url: e.registration_url, registration_deadline: e.registration_deadline, registration_status: e.registration_status,
    divisions, description: e.description, season: e.season, event_type: e.event_type, date_precision: e.date_precision, sessions,
  };
}

async function updateExisting(tx: Tx, eventId: string, sourceRecordId: string, c: NormalizedCandidate, input: IngestInput, now: Date): Promise<IngestOutcome> {
  const prev = await loadEventSnapshot(tx, eventId);
  const signal = detectStatusSignal({ schemaEventStatus: c.statusSignal.schemaEventStatus, text: c.statusSignal.text });
  const st = nextStatus(prev._status, signal);
  const next = candidateSnapshot(c, st.status);
  const { _status: _ignored, ...prevSnap } = prev;
  const changes = diffSnapshots(prevSnap, next);
  const review: string[] = [];

  // Fields another active source still supports with the old value become conflicts, not overwrites.
  const others = await tx.query<{ field: string; value: unknown }>(
    `SELECT fp.field, fp.value FROM field_provenance fp JOIN source_records sr ON sr.id=fp.source_record_id
     WHERE fp.event_id=$1 AND fp.source_record_id <> $2 AND sr.record_status='active'`, [eventId, sourceRecordId]);
  const applied = [] as typeof changes;
  for (const ch of changes) {
    const supportsOld = others.rows.some((o) => o.field === ch.field && JSON.stringify(o.value) === JSON.stringify(ch.oldValue));
    if (supportsOld && ch.material) {
      await tx.query(
        `INSERT INTO conflicts (event_id, field, candidates) VALUES ($1,$2,$3) ON CONFLICT (event_id, field) WHERE status='open' DO UPDATE SET candidates=EXCLUDED.candidates`,
        [eventId, ch.field, JSON.stringify({ current: ch.oldValue, proposed: ch.newValue, source_record_id: sourceRecordId })]);
      await openReview(tx, { kind: "conflict", eventId, reason: `Sources disagree on ${ch.field}` });
      review.push(`conflict:${ch.field}`);
    } else applied.push(ch);
  }
  const material = applied.some((ch) => ch.material);

  if (applied.length) {
    const fields = new Set(applied.map((a) => a.field));
    const organizerId = c.organizer ? await upsertOrganizer(tx, c.organizer.name, c.organizer.websiteUrl, input.source.is_synthetic) : null;
    await tx.query(
      `UPDATE events SET name=$2, start_date=$3, end_date=$4, start_at=$5, timezone=$6, status=$7, status_evidence=COALESCE($8, status_evidence),
         registration_url=$9, registration_deadline=$10, registration_deadline_status=$11, registration_status=$12, description=$13, season=$14,
         event_type=$15, date_precision=$16, time_known=$17, organizer_id=COALESCE($18, organizer_id), updated_at=$19
       WHERE id=$1`,
      [eventId, pick(fields, "name", c.name, prev.name), pick(fields, "start_date", c.startDate, prev.start_date), pick(fields, "end_date", c.endDate ?? c.startDate, prev.end_date),
        pick(fields, "start_at", next.start_at, prev.start_at), pick(fields, "timezone", c.timezone, prev.timezone), pick(fields, "status", st.status, prev._status), st.evidence,
        pick(fields, "registration_url", c.registrationUrl, prev.registration_url), pick(fields, "registration_deadline", c.registrationDeadline, prev.registration_deadline),
        (pick(fields, "registration_deadline", c.registrationDeadline, prev.registration_deadline) ? "known" : "unknown"),
        pick(fields, "registration_status", c.registrationStatus, prev.registration_status), pick(fields, "description", c.description, prev.description),
        pick(fields, "season", c.season, prev.season), pick(fields, "event_type", c.eventType, prev.event_type), pick(fields, "date_precision", c.datePrecision, prev.date_precision),
        !!c.startTime, organizerId, now],
    );
    if (fields.has("venues") || fields.has("divisions") || fields.has("sessions")) {
      const merged: NormalizedCandidate = { ...c };
      await writeChildren(tx, eventId, merged, input.source.is_synthetic);
    }
    for (const ch of applied) {
      await tx.query(`INSERT INTO event_changes (event_id, field, old_value, new_value, material, source_record_id) VALUES ($1,$2,$3,$4,$5,$6)`,
        [eventId, ch.field, JSON.stringify(ch.oldValue), JSON.stringify(ch.newValue), ch.material, sourceRecordId]);
    }
  }
  if (st.needsReview && st.status !== prev._status) {
    await openReview(tx, { kind: "status_change", eventId, reason: `Status ${prev._status} → ${st.status}: ${st.evidence ?? "no evidence"}` });
  }
  const finalSnap = await loadEventSnapshot(tx, eventId);
  const { _status: _s, ...finalNoStatus } = finalSnap;
  await tx.query(
    `UPDATE events SET last_checked_at=$2, last_success_at=$2, source_updated_at=COALESCE($3, source_updated_at),
       last_material_change_at = CASE WHEN $4 THEN $2 ELSE last_material_change_at END, content_hash=$5
     WHERE id=$1`, [eventId, now, c.sourceUpdatedAt, material, materialHash(finalNoStatus)]);
  await recordProvenance(tx, eventId, sourceRecordId, next, now);
  await refreshVerification(tx, eventId);
  if (!applied.length && !review.length) return { kind: "unchanged", eventId };
  return { kind: "updated", eventId, changes: applied.length, material, review };
}

function pick<T>(fields: Set<string>, f: string, nextV: T, prevV: unknown): T {
  return (fields.has(f) ? nextV : prevV) as T;
}

async function recordProvenance(tx: Tx, eventId: string, sourceRecordId: string, snap: Snapshot, now: Date) {
  for (const [field, value] of Object.entries(snap)) {
    await tx.query(
      `INSERT INTO field_provenance (event_id, field, source_record_id, value, observed_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (event_id, field, source_record_id) DO UPDATE SET value=EXCLUDED.value, observed_at=EXCLUDED.observed_at`,
      [eventId, field, sourceRecordId, JSON.stringify(value ?? null), now]);
  }
}

async function detectConflicts(tx: Tx, eventId: string, sourceRecordId: string, c: NormalizedCandidate) {
  const cur = await loadEventSnapshot(tx, eventId);
  const { _status: _x, ...curSnap } = cur;
  const incoming = candidateSnapshot(c, cur._status);
  for (const ch of diffSnapshots(curSnap, incoming)) {
    if (!ch.material || ch.newValue === null) continue;
    await tx.query(
      `INSERT INTO conflicts (event_id, field, candidates) VALUES ($1,$2,$3) ON CONFLICT (event_id, field) WHERE status='open' DO UPDATE SET candidates=EXCLUDED.candidates`,
      [eventId, ch.field, JSON.stringify({ current: ch.oldValue, proposed: ch.newValue, source_record_id: sourceRecordId })]);
    await openReview(tx, { kind: "conflict", eventId, reason: `Sources disagree on ${ch.field}` });
  }
}

export async function refreshVerification(tx: Tx, eventId: string) {
  const r = await tx.query<{ current: VerificationLevel; n: number; confirmed: boolean }>(
    `SELECT e.verification_level AS current,
            (SELECT count(DISTINCT sr.source_id)::int FROM source_records sr JOIN sources s ON s.id=sr.source_id
              WHERE sr.event_id=e.id AND sr.record_status='active' AND s.access_method <> 'manual') AS n,
            EXISTS (SELECT 1 FROM organizer_claims oc WHERE oc.organizer_id=e.organizer_id AND oc.status='approved' AND oc.confirmed_event_ids @> ARRAY[e.id]) AS confirmed
     FROM events e WHERE e.id=$1`, [eventId]);
  const row = r.rows[0]!;
  const level = computeVerification({ current: row.current, successfulSourceCount: row.n, organizerConfirmed: row.confirmed, adminVerified: false });
  if (level !== row.current) await tx.query(`UPDATE events SET verification_level=$2 WHERE id=$1`, [eventId, level]);
}

export async function openReview(tx: Tx | pg.Pool, r: { kind: string; eventId?: string | null; sourceId?: string | null; refId?: string | null; reason: string; payload?: unknown }) {
  await tx.query(
    `INSERT INTO review_items (kind, event_id, source_id, ref_id, reason, payload) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT DO NOTHING`,
    [r.kind, r.eventId ?? null, r.sourceId ?? null, r.refId ?? null, r.reason, JSON.stringify(r.payload ?? {})]);
}

async function findDuplicate(tx: Tx, c: NormalizedCandidate, synthetic: boolean): Promise<{ eventId: string; score: number; decision: string; features: unknown } | null> {
  if (!c.startDate && !c.registrationUrl) return null;
  const v = c.venues.find((x) => x.lat !== null);
  const regDomain = c.registrationUrl ? new URL(c.registrationUrl).hostname.replace(/^www\./, "") : null;
  const rows = (await tx.query(
    `SELECT e.id, e.name, o.name AS organizer_name, e.start_date, e.end_date, e.edition_id, e.series_id, e.registration_url,
            (SELECT ST_Y(vv.location::geometry) FROM event_venues ev JOIN venues vv ON vv.id=ev.venue_id WHERE ev.event_id=e.id AND vv.location IS NOT NULL LIMIT 1) AS lat,
            (SELECT ST_X(vv.location::geometry) FROM event_venues ev JOIN venues vv ON vv.id=ev.venue_id WHERE ev.event_id=e.id AND vv.location IS NOT NULL LIMIT 1) AS lon
     FROM events e LEFT JOIN organizers o ON o.id=e.organizer_id
     WHERE e.is_synthetic=$1 AND e.publish_state IN ('published','in_review','draft')
       AND (
         ($2::date IS NOT NULL AND e.during && daterange($2::date - 3, $2::date + 3, '[]'))
         OR ($3::text IS NOT NULL AND e.registration_url ILIKE '%' || $3 || '%')
       )
     LIMIT 200`, [synthetic, c.startDate, regDomain])).rows;
  const me: DedupEventView = {
    id: "new", name: c.name, organizerName: c.organizer?.name ?? null, startDate: c.startDate, endDate: c.endDate, editionId: null, seriesId: null,
    registrationUrl: c.registrationUrl, location: v ? { lat: v.lat!, lon: v.lon! } : null, externalIds: [],
  };
  let best: { eventId: string; score: number; decision: string; features: unknown } | null = null;
  const t = await thresholds(tx);
  for (const r of rows) {
    const other: DedupEventView = { id: r.id, name: r.name, organizerName: r.organizer_name, startDate: r.start_date, endDate: r.end_date, editionId: null, seriesId: r.series_id, registrationUrl: r.registration_url, location: r.lat != null ? { lat: r.lat, lon: r.lon } : null, externalIds: [] };
    if (!isCandidatePair(me, other)) continue;
    // Same series but different edition label → never merge.
    if (c.series && r.edition_id) {
      const ed = await tx.query<{ label: string }>(`SELECT label FROM event_editions WHERE id=$1`, [r.edition_id]);
      if (ed.rows[0] && ed.rows[0].label !== c.series.editionLabel) continue;
    }
    const s = scorePair(me, other, t);
    if (s.decision !== "distinct" && (!best || s.score > best.score)) best = { eventId: r.id, score: s.score, decision: s.decision, features: s.features };
  }
  return best;
}

/** Mark records a source no longer lists (or that 404) as missing: source_missing + review, never cancelled. */
export async function markRecordMissing(db: pg.Pool, sourceId: string, externalKey: string, httpStatus: number, now = new Date()) {
  return withTx(db, async (tx) => {
    const r = await tx.query<{ id: string; event_id: string | null }>(
      `UPDATE source_records SET record_status='missing', missing_since=COALESCE(missing_since,$3) WHERE source_id=$1 AND external_key=$2 RETURNING id, event_id`,
      [sourceId, externalKey, now]);
    const rec = r.rows[0];
    if (!rec?.event_id) return null;
    const ev = await tx.query<{ status: EventStatus }>(`SELECT status FROM events WHERE id=$1`, [rec.event_id]);
    const st = nextStatus(ev.rows[0]!.status, { kind: "http_missing", httpStatus });
    // last_checked_at moves; last_success_at and last_material_change_at do not.
    await tx.query(`UPDATE events SET status=$2, last_checked_at=$3 WHERE id=$1`, [rec.event_id, st.status, now]);
    if (st.status !== ev.rows[0]!.status) {
      await tx.query(`INSERT INTO event_changes (event_id, field, old_value, new_value, material, source_record_id) VALUES ($1,'status',$2,$3,false,$4)`,
        [rec.event_id, JSON.stringify(ev.rows[0]!.status), JSON.stringify(st.status), rec.id]);
    }
    await openReview(tx, { kind: "source_missing", eventId: rec.event_id, sourceId, reason: `Source returned HTTP ${httpStatus}; listing not found` });
    return rec.event_id;
  });
}

/** Record a failed attempt for an event: only last_checked_at moves (Invariant 3). */
export async function markEventCheckFailed(db: pg.Pool | Tx, eventId: string, now = new Date()) {
  await db.query(`UPDATE events SET last_checked_at=$2 WHERE id=$1`, [eventId, now]);
}
