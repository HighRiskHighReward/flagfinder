import type { NormalizedCandidate } from "@ff/core";
import { normalizeText, zonedTimeToUtc } from "@ff/core";

/** A comparable snapshot of an event's published fields, used for diffing and hashing. */
export type Snapshot = Record<string, unknown>;

export function candidateSnapshot(c: NormalizedCandidate, status: string): Snapshot {
  return {
    name: c.name,
    start_date: c.startDate,
    end_date: c.endDate ?? c.startDate,
    start_at: c.startDate && c.startTime ? zonedTimeToUtc(c.startDate, c.startTime, c.timezone).toISOString() : null,
    timezone: c.timezone,
    status,
    venues: c.venues.map((v) => ({ name: v.name, address: v.addressLine1, locality: v.locality, postal: v.postalCode, country: v.countryCode, lat: v.lat, lon: v.lon }))
      .sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name))),
    registration_url: c.registrationUrl,
    registration_deadline: c.registrationDeadline,
    registration_status: c.registrationStatus,
    divisions: c.divisions.map((d) => ({
      name: d.name, gender: d.genderCategory, level: d.levelCategory, rule: d.ageRuleType, min: d.ageMin, max: d.ageMax,
      cutoff: d.ageCutoffDate, by: [d.birthYearMin, d.birthYearMax], format: d.format, fee: d.feeAmountMinor, cur: d.feeCurrency, basis: d.pricingBasis,
    })).sort((a, b) => a.name.localeCompare(b.name)),
    // Non-material (logged, but no alerts):
    description: c.description,
    season: c.season,
    event_type: c.eventType,
    date_precision: c.datePrecision,
    sessions: c.sessions.map((s) => [s.name, s.startDate, s.endDate]),
  };
}
