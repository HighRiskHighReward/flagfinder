import type { AgeRule } from "./types";

export type EligibilityMatch = "definite" | "possible" | "no";

export interface AgeQuery {
  /** Inclusive age band of the athletes, as of game day. */
  min: number;
  max: number;
}

/**
 * Match an age band (ages on game day) against a division's published rule.
 * - "Ages 10–12" (no cutoff) is judged on game day.
 * - "12U, cutoff Aug 31" is judged on age as of the cutoff date, which can differ by a year.
 * A definite match requires a fully known rule under which *every* age in the band qualifies.
 * Partial or uncertain overlap → "possible" (confirm eligibility with organizer).
 * Must stay in parity with SQL function ff_age_match (tested).
 */
export function matchAge(rule: AgeRule, q: AgeQuery, eventStartDate: string | null): EligibilityMatch {
  if (rule.type === "unknown" || rule.type === "grade") return "possible";

  if (rule.type === "birth_year") {
    if (rule.birthYearMin == null && rule.birthYearMax == null) return "possible";
    if (!eventStartDate) return "possible";
    const y = +eventStartDate.slice(0, 4);
    // Age a on game day ⇒ born in year y-a or y-a-1.
    const byLo = y - q.max - 1;
    const byHi = y - q.min;
    const rLo = rule.birthYearMin ?? -Infinity;
    const rHi = rule.birthYearMax ?? Infinity;
    if (byLo >= rLo && byHi <= rHi) return "definite";
    if (byHi < rLo || byLo > rHi) return "no";
    return "possible";
  }

  // age_range / age_under
  const rLo = rule.min ?? (rule.type === "age_under" ? -Infinity : null);
  const rHi = rule.max;
  if (rLo === null || rHi === null) return "possible";

  let lo = q.min;
  let hi = q.max;
  if (rule.cutoffDate) {
    if (!eventStartDate) return "possible";
    // Ages as of cutoff may be up to one year lower (cutoff before event) or higher (after).
    if (rule.cutoffDate <= eventStartDate) lo = q.min - 1;
    else hi = q.max + 1;
  }
  if (lo >= rLo && hi <= rHi) return "definite";
  if (hi < rLo || lo > rHi) return "no";
  return "possible";
}

export function eligibilityLabel(m: EligibilityMatch): string {
  switch (m) {
    case "definite": return "Eligible ages match";
    case "possible": return "Possible match: confirm eligibility with organizer";
    case "no": return "Not eligible for these ages";
  }
}

export function describeAgeRule(rule: AgeRule): string {
  if (rule.original) return rule.original;
  switch (rule.type) {
    case "age_range": return rule.min != null && rule.max != null ? `Ages ${rule.min}–${rule.max}` : "Ages not published";
    case "age_under": return rule.max != null ? `${rule.max}U${rule.cutoffDate ? ` (age as of ${rule.cutoffDate})` : ""}` : "Ages not published";
    case "birth_year": return `Born ${rule.birthYearMin ?? "?"}–${rule.birthYearMax ?? "?"}`;
    case "grade": return `Grades ${rule.gradeMin ?? "?"}–${rule.gradeMax ?? "?"}`;
    default: return "Eligibility not published";
  }
}
