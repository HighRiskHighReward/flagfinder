import type pg from "pg";

/** Public coverage, computed from live data. Synthetic data is excluded from every count. */
export async function getCoverage(db: pg.Pool) {
  const [sources, regions, counts, gaps] = await Promise.all([
    db.query(`SELECT key, name, url, status, status_reason, access_method, coverage_regions, priority_bucket, refresh_cadence_minutes, last_attempt_at, last_success_at,
                     consecutive_failures, paused, published_count FROM sources WHERE NOT is_synthetic ORDER BY priority_bucket, status, name`),
    db.query(`SELECT r.slug, r.name, r.kind, r.priority_bucket,
                (SELECT count(DISTINCT e.id)::int FROM events e JOIN event_venues ev ON ev.event_id=e.id JOIN venues v ON v.id=ev.venue_id
                  WHERE e.publish_state='published' AND NOT e.is_synthetic AND e.end_date >= current_date
                    AND (ST_DWithin(v.location, r.center, r.radius_km*1000) OR lower(v.locality)=lower(r.name))) AS upcoming
              FROM regions r WHERE r.is_priority ORDER BY r.sort_order`),
    db.query(`SELECT count(*) FILTER (WHERE publish_state='published' AND end_date >= current_date)::int AS upcoming,
                     count(*) FILTER (WHERE publish_state='published')::int AS published,
                     count(*) FILTER (WHERE publish_state='in_review')::int AS in_review
              FROM events WHERE NOT is_synthetic`),
    db.query(`SELECT count(*)::int AS n FROM review_items WHERE status='open' AND kind IN ('source_missing','failed_source','stale')`),
  ]);
  return { sources: sources.rows, regions: regions.rows, counts: counts.rows[0], openHealthIssues: gaps.rows[0].n as number };
}
