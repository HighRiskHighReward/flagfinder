import type { CandidateInput } from "@ff/core";
import { getPool } from "../src/client";
import { TEST_DATABASE_URL } from "./global-setup";

export const db = () => getPool(TEST_DATABASE_URL);

export async function truncateAll() {
  await db().query(`TRUNCATE events, organizers, event_series, event_editions, venues, sources, source_records, raw_payloads, review_items,
    dedup_candidates, merges, conflicts, ingestion_runs, submissions, uploads, email_outbox, alert_deliveries, favorites, saved_searches,
    alert_preferences, planner_plans, organizer_claims, corrections, "user", rate_limits, provider_usage, dead_letters, fetch_state RESTART IDENTITY CASCADE`);
}

export async function makeSource(key: string, opts: { synthetic?: boolean; status?: string; access?: string } = {}) {
  const r = await db().query(
    `INSERT INTO sources (key, name, url, connector_key, parser_version, access_method, permission_notes, status, status_reason, is_synthetic)
     VALUES ($1,$1,'https://'||$1||'.example.org/','test','1',$4,'test',$3,'test',$2) RETURNING id, key, status, is_synthetic`,
    [key, opts.synthetic ?? false, opts.status ?? "enabled", opts.access ?? "ical"]);
  return r.rows[0] as { id: string; key: string; status: string; is_synthetic: boolean };
}

export function candidate(over: Partial<CandidateInput> = {}): CandidateInput {
  return {
    externalId: "ext-1",
    url: "https://city.example.org/calendar/ext-1",
    name: "Spring Girls Flag Football Tournament",
    organizer: { name: "Example Parks Dept", websiteUrl: "https://city.example.org" },
    eventType: "tournament",
    sportScope: "flag",
    startDate: "2027-03-13",
    endDate: "2027-03-14",
    timezone: "America/Chicago",
    datePrecision: "day",
    registrationUrl: "https://reg.example.org/spring-girls",
    venues: [{ name: "Oak Point Park", locality: "Plano", adminArea: "TX", countryCode: "US", lat: 33.03, lon: -96.68, geoPrecision: "street", geocodeProvider: "source_published", geocodeLicense: "source_published" }],
    divisions: [{ name: "Girls 10–12", genderCategory: "girls", levelCategory: "youth", ageRuleType: "age_range", ageMin: 10, ageMax: 12, eligibilityOriginal: "Ages 10–12", feeAmountMinor: 30000, feeCurrency: "USD", pricingBasis: "per_team" }],
    ...over,
  };
}
