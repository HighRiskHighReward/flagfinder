import { z } from "zod";
import {
  AGE_RULE_TYPES, COMPETITION_LEVELS, DATE_PRECISIONS, EVENT_TYPES, FORMATS, GENDER_CATEGORIES, GEO_PRECISIONS,
  INDOOR_OUTDOOR, LEVEL_CATEGORIES, PRICING_BASES, REGISTRATION_STATUSES, SPORT_SCOPES,
} from "./types";

/**
 * The normalized shape every connector, submission and extraction must produce.
 * Unknown stays null/'unknown' — never defaulted to a plausible value.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const httpUrl = z.string().url().refine((u) => /^https?:\/\//i.test(u), "http(s) only");

export const venueCandidateSchema = z.object({
  name: z.string().min(1).max(200),
  addressLine1: z.string().max(200).nullable().default(null),
  locality: z.string().max(120).nullable().default(null),
  adminArea: z.string().max(120).nullable().default(null),
  postalCode: z.string().max(16).nullable().default(null),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lon: z.number().min(-180).max(180).nullable().default(null),
  geoPrecision: z.enum(GEO_PRECISIONS).default("unknown"),
  geocodeProvider: z.string().nullable().default(null),
  geocodeLicense: z.string().nullable().default(null),
  indoorOutdoor: z.enum(INDOOR_OUTDOOR).default("unknown"),
}).refine((v) => (v.lat === null) === (v.lon === null), "lat/lon must both be present or absent")
  .refine((v) => v.lat === null || (v.geocodeProvider && v.geocodeLicense && v.geoPrecision !== "unknown"), "coordinates need provenance");

export const divisionCandidateSchema = z.object({
  name: z.string().min(1).max(200),
  sportScope: z.enum(SPORT_SCOPES).default("flag"),
  genderCategory: z.enum(GENDER_CATEGORIES).default("unknown"),
  genderLabelOriginal: z.string().max(120).nullable().default(null),
  levelCategory: z.enum(LEVEL_CATEGORIES).default("unknown"),
  ageRuleType: z.enum(AGE_RULE_TYPES).default("unknown"),
  ageMin: z.number().int().min(3).max(99).nullable().default(null),
  ageMax: z.number().int().min(3).max(99).nullable().default(null),
  birthYearMin: z.number().int().nullable().default(null),
  birthYearMax: z.number().int().nullable().default(null),
  gradeMin: z.number().int().nullable().default(null),
  gradeMax: z.number().int().nullable().default(null),
  ageCutoffDate: isoDate.nullable().default(null),
  eligibilityOriginal: z.string().max(500).nullable().default(null),
  format: z.enum(FORMATS).default("unknown"),
  contactClassification: z.string().max(60).nullable().default(null),
  rulebookUrl: httpUrl.nullable().default(null),
  competitionLevel: z.enum(COMPETITION_LEVELS).default("unknown"),
  gameGuarantee: z.number().int().min(0).max(50).nullable().default(null),
  feeAmountMinor: z.number().int().min(0).nullable().default(null),
  feeCurrency: z.string().regex(/^[A-Z]{3}$/).nullable().default(null),
  pricingBasis: z.enum(PRICING_BASES).default("unknown"),
  capacityTeams: z.number().int().min(1).nullable().default(null),
  extraFees: z.array(z.object({ label: z.string().max(120), amountMinor: z.number().int().min(0), currency: z.string().regex(/^[A-Z]{3}$/), pricingBasis: z.enum(PRICING_BASES).default("unknown"), mandatory: z.boolean().default(true) })).default([]),
}).refine((d) => d.feeAmountMinor === null || d.feeCurrency !== null, "fee needs a currency");

export const sessionCandidateSchema = z.object({
  name: z.string().min(1).max(120),
  startDate: isoDate,
  endDate: isoDate,
  gameDays: z.array(z.string().max(20)).default([]),
  practiceSchedule: z.string().max(300).nullable().default(null),
});

export const ambiguitySchema = z.object({ field: z.string(), reason: z.string(), evidence: z.string().max(500).nullable().default(null) });

export const candidateSchema = z.object({
  externalId: z.string().max(300).nullable().default(null),
  url: httpUrl,
  sourceUpdatedAt: z.string().datetime({ offset: true }).nullable().default(null),
  name: z.string().min(2).max(250),
  organizer: z.object({ name: z.string().min(1).max(200), websiteUrl: httpUrl.nullable().default(null) }).nullable().default(null),
  series: z.object({ name: z.string().min(1).max(200), editionLabel: z.string().min(1).max(60) }).nullable().default(null),
  eventType: z.enum(EVENT_TYPES).default("other"),
  sportScope: z.enum(SPORT_SCOPES).default("unknown"),
  season: z.string().max(60).nullable().default(null),
  startDate: isoDate.nullable().default(null),
  endDate: isoDate.nullable().default(null),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  timezone: z.string().min(3).max(60),
  datePrecision: z.enum(DATE_PRECISIONS).default("tbd"),
  statusSignal: z.object({ schemaEventStatus: z.string().nullable().default(null), text: z.string().max(2000).nullable().default(null) }).default({ schemaEventStatus: null, text: null }),
  registrationUrl: httpUrl.nullable().default(null),
  registrationDeadline: isoDate.nullable().default(null),
  registrationStatus: z.enum(REGISTRATION_STATUSES).default("unknown"),
  description: z.string().max(5000).nullable().default(null),
  venues: z.array(venueCandidateSchema).max(20).default([]),
  divisions: z.array(divisionCandidateSchema).max(60).default([]),
  sessions: z.array(sessionCandidateSchema).max(60).default([]),
  ambiguities: z.array(ambiguitySchema).default([]),
}).refine((c) => !c.startDate || !c.endDate || c.endDate >= c.startDate, "end before start");

export type NormalizedCandidate = z.infer<typeof candidateSchema>;
export type CandidateInput = z.input<typeof candidateSchema>;
export type VenueCandidate = z.infer<typeof venueCandidateSchema>;
export type DivisionCandidate = z.infer<typeof divisionCandidateSchema>;

export function slugify(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
}
