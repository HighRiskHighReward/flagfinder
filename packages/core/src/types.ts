export const EVENT_TYPES = ["tournament", "league", "clinic", "combine", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const SPORT_SCOPES = ["flag", "tackle", "7v7_passing_non_flag", "mixed", "unknown"] as const;
export type SportScope = (typeof SPORT_SCOPES)[number];
export const DATE_PRECISIONS = ["exact", "day", "month", "tbd"] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];
export const EVENT_STATUSES = ["scheduled", "postponed", "cancelled", "source_missing", "completed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const VERIFICATION_LEVELS = [
  "discovered_unverified",
  "awaiting_verification",
  "source_checked",
  "multi_source_corroborated",
  "organizer_confirmed",
  "admin_verified",
] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];
export const REGISTRATION_STATUSES = ["open", "closed", "waitlist", "not_yet_open", "unknown"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];
export const GENDER_CATEGORIES = ["girls", "boys", "coed", "womens", "mens", "other", "unknown"] as const;
export type GenderCategory = (typeof GENDER_CATEGORIES)[number];
export const LEVEL_CATEGORIES = ["youth", "high_school", "collegiate", "adult", "unknown"] as const;
export type LevelCategory = (typeof LEVEL_CATEGORIES)[number];
export const AGE_RULE_TYPES = ["age_range", "age_under", "birth_year", "grade", "unknown"] as const;
export type AgeRuleType = (typeof AGE_RULE_TYPES)[number];
export const FORMATS = ["5v5", "6v6", "7v7", "other", "unknown"] as const;
export type PlayFormat = (typeof FORMATS)[number];
export const COMPETITION_LEVELS = ["recreational", "competitive", "elite", "unknown"] as const;
export type CompetitionLevel = (typeof COMPETITION_LEVELS)[number];
export const PRICING_BASES = ["per_team", "per_player", "per_family", "unknown"] as const;
export type PricingBasis = (typeof PRICING_BASES)[number];
export const GEO_PRECISIONS = ["rooftop", "street", "postal", "city", "unknown"] as const;
export type GeoPrecision = (typeof GEO_PRECISIONS)[number];
export const INDOOR_OUTDOOR = ["indoor", "outdoor", "both", "unknown"] as const;
export type IndoorOutdoor = (typeof INDOOR_OUTDOOR)[number];

export interface Fee {
  status: "known" | "unknown";
  amountMinor: number | null;
  currency: string | null;
  basis: PricingBasis;
}

export interface AgeRule {
  type: AgeRuleType;
  min: number | null;
  max: number | null;
  birthYearMin?: number | null;
  birthYearMax?: number | null;
  gradeMin?: number | null;
  gradeMax?: number | null;
  /** Age is computed as of this local date (e.g. "12U as of Aug 31"). null = unknown/game day. */
  cutoffDate: string | null;
  original: string | null;
}
