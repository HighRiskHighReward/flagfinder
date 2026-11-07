import type pg from "pg";

export interface EventDetail {
  id: string; slug: string; name: string; eventType: string; sportScope: string; season: string | null; status: string; statusEvidence: string | null;
  startDate: string | null; endDate: string | null; startAt: string | null; endAt: string | null; timezone: string; datePrecision: string; timeKnown: boolean;
  registrationUrl: string | null; registrationDeadline: string | null; registrationStatus: string; availability: string; description: string | null;
  verificationLevel: string; isSynthetic: boolean; publishState: string; discoveredAt: string; lastCheckedAt: string | null; lastSuccessAt: string | null;
  sourceUpdatedAt: string | null; lastMaterialChangeAt: string | null;
  organizer: { id: string; name: string; websiteUrl: string | null; email: string | null; phone: string | null } | null;
  venues: { id: string; name: string; addressLine1: string | null; locality: string | null; adminArea: string | null; postalCode: string | null; countryCode: string; lat: number | null; lon: number | null; geoPrecision: string; geocodeProvider: string | null; geocodeLicense: string | null; indoorOutdoor: string; isPrimary: boolean }[];
  divisions: { id: string; name: string; genderCategory: string; genderLabelOriginal: string | null; levelCategory: string; ageRuleType: string; ageMin: number | null; ageMax: number | null; birthYearMin: number | null; birthYearMax: number | null; gradeMin: number | null; gradeMax: number | null; ageCutoffDate: string | null; eligibilityOriginal: string | null; format: string; contactClassification: string | null; rulebookUrl: string | null; competitionLevel: string; gameGuarantee: number | null; feeStatus: string; feeAmountMinor: number | null; feeCurrency: string | null; pricingBasis: string; capacityStatus: string; capacityTeams: number | null; extraFees: { label: string; amountMinor: number; currency: string; pricingBasis: string; mandatory: boolean }[] }[];
  sessions: { name: string; startDate: string; endDate: string; gameDays: string[]; practiceSchedule: string | null }[];
  sources: { sourceName: string; sourceKey: string; url: string; lastSeenAt: string; recordStatus: string; accessMethod: string; refreshCadenceMinutes: number }[];
  changes: { field: string; oldValue: unknown; newValue: unknown; material: boolean; detectedAt: string; sourceName: string | null }[];
  openConflicts: { field: string; candidates: unknown }[];
}

const iso = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

export async function getEventBySlug(db: pg.Pool, slug: string, opts: { includeUnpublished?: boolean } = {}): Promise<EventDetail | null> {
  const e = (await db.query(
    `SELECT e.*, o.id AS o_id, o.name AS o_name, o.website_url AS o_web, o.published_contact_email AS o_email, o.published_contact_phone AS o_phone
     FROM events e LEFT JOIN organizers o ON o.id=e.organizer_id WHERE e.slug=$1 ${opts.includeUnpublished ? "" : "AND e.publish_state='published'"}`, [slug])).rows[0];
  if (!e) return null;
  const [venues, divisions, fees, sessions, sources, changes, conflicts] = await Promise.all([
    db.query(`SELECT v.*, ev.is_primary, ST_Y(v.location::geometry) AS lat, ST_X(v.location::geometry) AS lon FROM event_venues ev JOIN venues v ON v.id=ev.venue_id WHERE ev.event_id=$1 ORDER BY ev.is_primary DESC, v.name`, [e.id]),
    db.query(`SELECT * FROM divisions WHERE event_id=$1 ORDER BY age_max NULLS LAST, name`, [e.id]),
    db.query(`SELECT f.* FROM division_extra_fees f JOIN divisions d ON d.id=f.division_id WHERE d.event_id=$1`, [e.id]),
    db.query(`SELECT * FROM league_sessions WHERE event_id=$1 ORDER BY start_date`, [e.id]),
    db.query(`SELECT s.name, s.key, s.access_method, s.refresh_cadence_minutes, sr.url, sr.last_seen_at, sr.record_status FROM source_records sr JOIN sources s ON s.id=sr.source_id WHERE sr.event_id=$1 AND sr.record_status <> 'rejected' ORDER BY sr.first_seen_at`, [e.id]),
    db.query(`SELECT c.field, c.old_value, c.new_value, c.material, c.detected_at, s.name AS source_name FROM event_changes c LEFT JOIN source_records sr ON sr.id=c.source_record_id LEFT JOIN sources s ON s.id=sr.source_id WHERE c.event_id=$1 ORDER BY c.detected_at DESC LIMIT 50`, [e.id]),
    db.query(`SELECT field, candidates FROM conflicts WHERE event_id=$1 AND status='open'`, [e.id]),
  ]);
  return {
    id: e.id, slug: e.slug, name: e.name, eventType: e.event_type, sportScope: e.sport_scope, season: e.season, status: e.status, statusEvidence: e.status_evidence,
    startDate: e.start_date, endDate: e.end_date, startAt: iso(e.start_at), endAt: iso(e.end_at), timezone: e.timezone, datePrecision: e.date_precision, timeKnown: e.time_known,
    registrationUrl: e.registration_url, registrationDeadline: e.registration_deadline, registrationStatus: e.registration_status, availability: e.availability, description: e.description,
    verificationLevel: e.verification_level, isSynthetic: e.is_synthetic, publishState: e.publish_state, discoveredAt: iso(e.discovered_at)!, lastCheckedAt: iso(e.last_checked_at),
    lastSuccessAt: iso(e.last_success_at), sourceUpdatedAt: iso(e.source_updated_at), lastMaterialChangeAt: iso(e.last_material_change_at),
    organizer: e.o_id ? { id: e.o_id, name: e.o_name, websiteUrl: e.o_web, email: e.o_email, phone: e.o_phone } : null,
    venues: venues.rows.map((v) => ({ id: v.id, name: v.name, addressLine1: v.address_line1, locality: v.locality, adminArea: v.admin_area, postalCode: v.postal_code, countryCode: v.country_code, lat: v.lat, lon: v.lon, geoPrecision: v.geo_precision, geocodeProvider: v.geocode_provider, geocodeLicense: v.geocode_license, indoorOutdoor: v.indoor_outdoor, isPrimary: v.is_primary })),
    divisions: divisions.rows.map((d) => ({
      id: d.id, name: d.name, genderCategory: d.gender_category, genderLabelOriginal: d.gender_label_original, levelCategory: d.level_category, ageRuleType: d.age_rule_type, ageMin: d.age_min, ageMax: d.age_max,
      birthYearMin: d.birth_year_min, birthYearMax: d.birth_year_max, gradeMin: d.grade_min, gradeMax: d.grade_max, ageCutoffDate: d.age_cutoff_date, eligibilityOriginal: d.eligibility_original, format: d.format,
      contactClassification: d.contact_classification, rulebookUrl: d.rulebook_url, competitionLevel: d.competition_level, gameGuarantee: d.game_guarantee, feeStatus: d.fee_status, feeAmountMinor: d.fee_amount_minor,
      feeCurrency: d.fee_currency, pricingBasis: d.pricing_basis, capacityStatus: d.capacity_status, capacityTeams: d.capacity_teams,
      extraFees: fees.rows.filter((f) => f.division_id === d.id).map((f) => ({ label: f.label, amountMinor: Number(f.amount_minor), currency: f.currency, pricingBasis: f.pricing_basis, mandatory: f.mandatory })),
    })),
    sessions: sessions.rows.map((s) => ({ name: s.name, startDate: s.start_date, endDate: s.end_date, gameDays: s.game_days, practiceSchedule: s.practice_schedule })),
    sources: sources.rows.map((s) => ({ sourceName: s.name, sourceKey: s.key, url: s.url, lastSeenAt: iso(s.last_seen_at)!, recordStatus: s.record_status, accessMethod: s.access_method, refreshCadenceMinutes: s.refresh_cadence_minutes })),
    changes: changes.rows.map((c) => ({ field: c.field, oldValue: c.old_value, newValue: c.new_value, material: c.material, detectedAt: iso(c.detected_at)!, sourceName: c.source_name })),
    openConflicts: conflicts.rows,
  };
}
