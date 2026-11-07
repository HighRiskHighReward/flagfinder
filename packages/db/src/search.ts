import { addDays, formatDistance, resolveSearch, todayIn, toKm, type ResolvedSearch, type SearchState } from "@ff/core";
import type pg from "pg";

export const PAGE_SIZE = 25;
export const MAX_RESULTS = 500;

export interface SearchVenue {
  id: string; name: string; locality: string | null; adminArea: string | null; postalCode: string | null; countryCode: string; addressLine1: string | null;
  lat: number | null; lon: number | null; geoPrecision: string; geocodeProvider: string | null; geocodeLicense: string | null; indoorOutdoor: string;
}
export interface SearchResult {
  id: string; slug: string; name: string; eventType: string; status: string; startDate: string | null; endDate: string | null; timezone: string;
  datePrecision: string; registrationUrl: string | null; registrationDeadline: string | null; registrationStatus: string;
  verificationLevel: string; isSynthetic: boolean; lastSuccessAt: string | null; lastCheckedAt: string | null; lastMaterialChangeAt: string | null;
  discoveredAt: string; organizerName: string | null; venues: SearchVenue[]; distanceKm: number | null; distanceLabel: string | null;
  ageMatch: "definite" | "possible" | null; minFee: { amountMinor: number; currency: string; basis: string } | null; feeUnknown: boolean;
  divisionsSummary: string[]; nextSessionStart: string | null; bestScore: number | null;
}
export interface SearchResponse {
  total: number; mappable: number; truncated: boolean; results: SearchResult[]; resolved: ResolvedSearch;
  anchor: { lat: number; lon: number; label: string } | null; regionName: string | null; today: string;
  unknownCounts: Record<string, number>;
}

interface Built { where: string[]; params: unknown[]; divWhere: string[]; anchorSql: string | null }

function p(b: { params: unknown[] }, v: unknown): string { b.params.push(v); return `$${b.params.length}`; }

export async function searchEvents(db: pg.Pool, state: SearchState, opts: { showSynthetic: boolean; timeZone?: string; now?: Date; explain?: (plan: string) => void } ): Promise<SearchResponse> {
  const today = todayIn(opts.timeZone ?? "America/Chicago", opts.now);
  const r = resolveSearch(state, today);
  const b: Built = { where: [`e.publish_state = 'published'`, `e.status <> 'completed'`], params: [], divWhere: [], anchorSql: null };
  if (!opts.showSynthetic) b.where.push(`NOT e.is_synthetic`);

  // ----- dates: overlapping ranges (multi-day events + league sessions) -----
  const fromP = p(b, r.from), toP = p(b, r.to ?? null);
  b.where.push(`(e.during && daterange(${fromP}::date, ${toP}::date, '[]') OR EXISTS (SELECT 1 FROM league_sessions ls WHERE ls.event_id=e.id AND ls.during && daterange(${fromP}::date, ${toP}::date, '[]')))`);

  // ----- location -----
  let anchor: SearchResponse["anchor"] = null;
  let regionName: string | null = null;
  const unit = r.unit ?? "mi";
  if (r.bbox) {
    const [w, s, e, n] = r.bbox.split(",").map(Number) as [number, number, number, number];
    b.where.push(`EXISTS (SELECT 1 FROM event_venues ev JOIN venues v ON v.id=ev.venue_id WHERE ev.event_id=e.id AND v.location && ST_MakeEnvelope(${p(b, w)},${p(b, s)},${p(b, e)},${p(b, n)},4326)::geography)`);
    anchor = { lat: (s + n) / 2, lon: (w + e) / 2, label: "map area" };
  } else if (r.lat !== undefined && r.lon !== undefined) {
    anchor = { lat: r.lat, lon: r.lon, label: "your location" };
    const km = toKm(r.radius ?? 25, unit);
    b.where.push(`EXISTS (SELECT 1 FROM event_venues ev JOIN venues v ON v.id=ev.venue_id WHERE ev.event_id=e.id AND ST_DWithin(v.location, ST_SetSRID(ST_MakePoint(${p(b, r.lon)},${p(b, r.lat)}),4326)::geography, ${p(b, km * 1000)}))`);
  } else if (r.postal) {
    b.where.push(`EXISTS (SELECT 1 FROM event_venues ev JOIN venues v ON v.id=ev.venue_id WHERE ev.event_id=e.id AND upper(replace(v.postal_code,' ','')) = upper(replace(${p(b, r.postal)},' ','')))`);
  } else if (r.regionSlug) {
    const reg = (await db.query(`SELECT r.id, r.name, r.kind, r.country_code, r.admin_area, ST_Y(r.center::geometry) AS lat, ST_X(r.center::geometry) AS lon, r.radius_km::float8 AS radius_km FROM regions r WHERE slug=$1`, [r.regionSlug])).rows[0];
    if (reg) {
      regionName = reg.name;
      anchor = { lat: reg.lat, lon: reg.lon, label: reg.name };
      if (reg.kind === "country") {
        b.where.push(`EXISTS (SELECT 1 FROM event_venues ev JOIN venues v ON v.id=ev.venue_id WHERE ev.event_id=e.id AND v.country_code=${p(b, reg.country_code)})`);
      } else if (reg.kind === "state") {
        b.where.push(`EXISTS (SELECT 1 FROM event_venues ev JOIN venues v ON v.id=ev.venue_id WHERE ev.event_id=e.id AND v.country_code=${p(b, reg.country_code)} AND upper(v.admin_area) IN (upper(${p(b, reg.admin_area)}), upper(${p(b, reg.name)})))`);
      } else {
        const km = r.radius ? toKm(r.radius, unit) : Number(reg.radius_km);
        const centerP = `ST_SetSRID(ST_MakePoint(${p(b, reg.lon)},${p(b, reg.lat)}),4326)::geography`;
        const radP = p(b, km * 1000);
        const regIdP = p(b, reg.id);
        // Mappable venues within radius, OR unmappable venues whose published city is in this region.
        b.where.push(`EXISTS (SELECT 1 FROM event_venues ev JOIN venues v ON v.id=ev.venue_id WHERE ev.event_id=e.id AND (
          ST_DWithin(v.location, ${centerP}, ${radP})
          OR (v.location IS NULL AND lower(v.locality) IN (SELECT lower(name) FROM regions WHERE id=${regIdP} OR parent_id=${regIdP}))))`);
      }
    }
  } else if (r.country) {
    b.where.push(`EXISTS (SELECT 1 FROM event_venues ev JOIN venues v ON v.id=ev.venue_id WHERE ev.event_id=e.id AND v.country_code=${p(b, r.country)})`);
  }
  if (anchor) b.anchorSql = `ST_SetSRID(ST_MakePoint(${p(b, anchor.lon)},${p(b, anchor.lat)}),4326)::geography`;

  // ----- event-level filters -----
  if (r.type.length) b.where.push(`e.event_type = ANY(${p(b, r.type)}::event_type[])`);
  if (r.reg.length) b.where.push(r.unk.includes("reg") ? `(e.registration_status = ANY(${p(b, r.reg)}::registration_status[]) OR e.registration_status='unknown')` : `e.registration_status = ANY(${p(b, r.reg)}::registration_status[])`);
  if (r.closingDays) b.where.push(`e.registration_deadline BETWEEN ${p(b, today)}::date AND ${p(b, addDays(today, r.closingDays))}::date AND e.registration_status IN ('open','unknown')`);
  if (r.io.length) b.where.push(`EXISTS (SELECT 1 FROM event_venues ev JOIN venues v ON v.id=ev.venue_id WHERE ev.event_id=e.id AND (v.indoor_outdoor = ANY(${p(b, r.io)}::indoor_outdoor[])${r.unk.includes("io") ? " OR v.indoor_outdoor='unknown'" : ""}))`);
  if (r.organizer) b.where.push(`e.organizer_id = ${p(b, r.organizer)}`);
  if (r.verif) b.where.push(`ff_verification_rank(e.verification_level) >= ff_verification_rank(${p(b, r.verif)}::verification_level)`);
  if (r.freshDays) b.where.push(`e.last_success_at >= now() - make_interval(days => ${p(b, r.freshDays)})`);
  if (r.q) b.where.push(`(e.search_tsv @@ websearch_to_tsquery('simple', ${p(b, r.q)}) OR e.name % ${p(b, r.q)} OR e.name ILIKE '%' || ${p(b, r.q)} || '%')`);

  // ----- division-level filters (all must hold on the same division) -----
  const unk = (k: string) => r.unk.includes(k as never);
  const dw = b.divWhere;
  const divFilterKeys: string[] = [];
  if (r.gender.length) { divFilterKeys.push("gender"); dw.push(`(d.gender_category = ANY(${p(b, r.gender)}::gender_category[])${unk("gender") ? " OR d.gender_category='unknown'" : ""})`); }
  if (r.level.length) { divFilterKeys.push("level"); dw.push(`(d.level_category = ANY(${p(b, r.level)}::level_category[])${unk("level") ? " OR d.level_category='unknown'" : ""})`); }
  if (r.format.length) { divFilterKeys.push("format"); dw.push(`(d.format = ANY(${p(b, r.format)}::play_format[])${unk("format") ? " OR d.format='unknown'" : ""})`); }
  if (r.comp.length) { divFilterKeys.push("comp"); dw.push(`(d.competition_level = ANY(${p(b, r.comp)}::competition_level[])${unk("comp") ? " OR d.competition_level='unknown'" : ""})`); }
  if (r.guarantee) { divFilterKeys.push("guarantee"); dw.push(`(d.game_guarantee >= ${p(b, r.guarantee)}${unk("guarantee") ? " OR d.game_guarantee IS NULL" : ""})`); }
  if (r.feeMax !== undefined) {
    divFilterKeys.push("fee");
    dw.push(`((d.fee_status='known' AND d.fee_amount_minor <= ${p(b, r.feeMax)} AND d.fee_currency = ${p(b, r.currency ?? "USD")})${unk("fee") ? " OR d.fee_status='unknown'" : ""})`);
  }
  if (r.basis.length) { divFilterKeys.push("fee"); dw.push(`(d.pricing_basis = ANY(${p(b, r.basis)}::pricing_basis[])${unk("fee") ? " OR d.pricing_basis='unknown'" : ""})`); }
  let ageExpr = "NULL::text";
  if (r.ageMin !== undefined && r.ageMax !== undefined) {
    divFilterKeys.push("age");
    ageExpr = `ff_age_match(d.age_rule_type, d.age_min, d.age_max, d.birth_year_min, d.birth_year_max, d.age_cutoff_date, ${p(b, r.ageMin)}, ${p(b, r.ageMax)}, e.start_date)`;
    dw.push(unk("age") ? `${ageExpr} <> 'no'` : `(${ageExpr} <> 'no' AND d.age_rule_type <> 'unknown')`);
  }
  if (dw.length) {
    const noDivisionsAllowed = divFilterKeys.every((k) => unk(k));
    b.where.push(`(EXISTS (SELECT 1 FROM divisions d WHERE d.event_id=e.id AND ${dw.join(" AND ")})${noDivisionsAllowed ? " OR NOT EXISTS (SELECT 1 FROM divisions d WHERE d.event_id=e.id)" : ""})`);
  }
  const divMatchCond = dw.length ? dw.join(" AND ") : "TRUE";

  const distSql = b.anchorSql
    ? `(SELECT min(ST_Distance(v.location, ${b.anchorSql})) FROM event_venues ev JOIN venues v ON v.id=ev.venue_id WHERE ev.event_id=e.id AND v.location IS NOT NULL)`
    : "NULL::float8";
  const todayP = p(b, today);
  const orderBy: Record<string, string> = {
    soonest: `coalesce(next_session, e.start_date) ASC NULLS LAST, e.name ASC`,
    nearest: `dist_m ASC NULLS LAST, e.start_date ASC`,
    price: `(min_fee IS NULL) ASC, min_fee_cur ASC NULLS LAST, min_fee_basis_rank ASC NULLS LAST, min_fee ASC NULLS LAST, e.start_date ASC`,
    closing: `e.registration_deadline ASC NULLS LAST, e.start_date ASC`,
    discovered: `e.discovered_at DESC`,
    updated: `e.last_material_change_at DESC NULLS LAST`,
    best: `best_score DESC, e.start_date ASC`,
  };

  const sql = `
    WITH base AS (
      SELECT e.*, o.name AS organizer_name,
        ${distSql} AS dist_m,
        (SELECT min(ls.start_date) FROM league_sessions ls WHERE ls.event_id=e.id AND ls.end_date >= ${fromP}::date) AS next_session,
        (SELECT CASE WHEN bool_or(m='definite') THEN 'definite' WHEN bool_or(m='possible') THEN 'possible' ELSE NULL END
           FROM (SELECT ${ageExpr} AS m FROM divisions d WHERE d.event_id=e.id AND ${divMatchCond}) mm) AS age_match,
        fee.min_fee, fee.min_fee_cur, fee.min_fee_basis, fee.min_fee_basis_rank,
        NOT EXISTS (SELECT 1 FROM divisions d WHERE d.event_id=e.id AND d.fee_status='known') AS fee_unknown
      FROM events e
      LEFT JOIN organizers o ON o.id = e.organizer_id
      LEFT JOIN LATERAL (
        SELECT d.fee_amount_minor AS min_fee, d.fee_currency AS min_fee_cur, d.pricing_basis::text AS min_fee_basis,
               CASE d.pricing_basis WHEN 'per_player' THEN 0 WHEN 'per_family' THEN 1 WHEN 'per_team' THEN 2 ELSE 3 END AS min_fee_basis_rank
        FROM divisions d WHERE d.event_id=e.id AND d.fee_status='known' AND ${divMatchCond}
        ORDER BY d.fee_currency, CASE d.pricing_basis WHEN 'per_player' THEN 0 WHEN 'per_family' THEN 1 WHEN 'per_team' THEN 2 ELSE 3 END, d.fee_amount_minor LIMIT 1
      ) fee ON TRUE
      WHERE ${b.where.join("\n        AND ")}
    ), scored AS (
      SELECT base.*,
        ( (CASE age_match WHEN 'definite' THEN 1.0 WHEN 'possible' THEN 0.5 ELSE 0.75 END) * 0.35
        + (CASE WHEN dist_m IS NULL THEN 0.3 ELSE greatest(0, 1 - dist_m / 80000.0) END) * 0.25
        + greatest(0, 1 - (coalesce(next_session, start_date) - ${todayP}::date) / 120.0) * 0.2
        + (ff_verification_rank(verification_level) / 6.0) * 0.1
        + (CASE WHEN last_success_at IS NULL THEN 0 ELSE greatest(0, 1 - extract(epoch FROM now() - last_success_at) / (14*86400.0)) END) * 0.1
        )::float8 AS best_score
      FROM base
    )
    SELECT e.*, count(*) OVER() AS total_count FROM scored e
    ORDER BY ${orderBy[r.sort]}
    LIMIT ${MAX_RESULTS + 1}`;
  if (opts.explain) opts.explain((await db.query(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${sql}`, b.params)).rows.map((r) => r["QUERY PLAN"]).join("\n"));
  const rows = (await db.query(sql, b.params)).rows;
  const truncated = rows.length > MAX_RESULTS;
  const page = rows.slice(0, MAX_RESULTS);
  const ids = page.map((x) => x.id);

  const venues = ids.length ? (await db.query(
    `SELECT ev.event_id, ev.is_primary, v.id, v.name, v.locality, v.admin_area, v.postal_code, v.country_code, v.address_line1,
            ST_Y(v.location::geometry) AS lat, ST_X(v.location::geometry) AS lon, v.geo_precision, v.geocode_provider, v.geocode_license, v.indoor_outdoor
     FROM event_venues ev JOIN venues v ON v.id=ev.venue_id WHERE ev.event_id = ANY($1) ORDER BY ev.is_primary DESC, v.name`, [ids])).rows : [];
  const divs = ids.length ? (await db.query(`SELECT event_id, name FROM divisions WHERE event_id = ANY($1) ORDER BY name`, [ids])).rows : [];

  const results: SearchResult[] = page.map((x) => {
    const vs = venues.filter((v) => v.event_id === x.id).map((v): SearchVenue => ({
      id: v.id, name: v.name, locality: v.locality, adminArea: v.admin_area, postalCode: v.postal_code, countryCode: v.country_code, addressLine1: v.address_line1,
      lat: v.lat, lon: v.lon, geoPrecision: v.geo_precision, geocodeProvider: v.geocode_provider, geocodeLicense: v.geocode_license, indoorOutdoor: v.indoor_outdoor,
    }));
    const km = x.dist_m == null ? null : x.dist_m / 1000;
    return {
      id: x.id, slug: x.slug, name: x.name, eventType: x.event_type, status: x.status, startDate: x.start_date, endDate: x.end_date, timezone: x.timezone,
      datePrecision: x.date_precision, registrationUrl: x.registration_url, registrationDeadline: x.registration_deadline, registrationStatus: x.registration_status,
      verificationLevel: x.verification_level, isSynthetic: x.is_synthetic, lastSuccessAt: iso(x.last_success_at), lastCheckedAt: iso(x.last_checked_at),
      lastMaterialChangeAt: iso(x.last_material_change_at), discoveredAt: iso(x.discovered_at)!, organizerName: x.organizer_name, venues: vs,
      distanceKm: km, distanceLabel: km == null ? null : formatDistance(km, unit), ageMatch: x.age_match,
      minFee: x.min_fee == null ? null : { amountMinor: Number(x.min_fee), currency: x.min_fee_cur, basis: x.min_fee_basis }, feeUnknown: x.fee_unknown,
      divisionsSummary: divs.filter((d) => d.event_id === x.id).map((d) => d.name), nextSessionStart: x.next_session, bestScore: x.best_score,
    };
  });
  const total = rows.length ? Number(rows[0].total_count) : 0;
  const mappable = results.filter((x) => x.venues.some((v) => v.lat !== null)).length;
  return { total, mappable, truncated, results, resolved: r, anchor, regionName, today, unknownCounts: {} };
}

function iso(v: unknown): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}
