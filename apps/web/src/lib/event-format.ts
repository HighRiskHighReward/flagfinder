import { describeAgeRule, formatFee, type AgeRuleType, type PricingBasis } from "@ff/core";
import type { EventDetail } from "@ff/db";

type Div = EventDetail["divisions"][number];

export function divisionEligibility(d: Div): string {
  return describeAgeRule({ type: d.ageRuleType as AgeRuleType, min: d.ageMin, max: d.ageMax, birthYearMin: d.birthYearMin, birthYearMax: d.birthYearMax, gradeMin: d.gradeMin, gradeMax: d.gradeMax, cutoffDate: d.ageCutoffDate, original: d.eligibilityOriginal });
}
export function divisionFee(d: Div): string {
  return formatFee({ status: d.feeStatus as "known", amountMinor: d.feeAmountMinor, currency: d.feeCurrency, basis: d.pricingBasis as PricingBasis });
}
export const GENDER_LABEL: Record<string, string> = { girls: "Girls", boys: "Boys", coed: "Coed", womens: "Women's", mens: "Men's", other: "Other", unknown: "Gender not published" };
export const LEVEL_LABEL: Record<string, string> = { youth: "Youth", high_school: "High school", collegiate: "Collegiate", adult: "Adult", unknown: "Level not published" };
export const UNKNOWN = "Not published";

export function venueAddress(v: EventDetail["venues"][number]): string {
  return [v.addressLine1, v.locality, v.adminArea, v.postalCode, v.countryCode].filter(Boolean).join(", ");
}
