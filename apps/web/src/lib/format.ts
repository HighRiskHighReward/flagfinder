import { formatDateRange, formatFee, relativeAge, VERIFICATION_EXPLANATIONS, type VerificationLevel } from "@ff/core";

export { formatDateRange, relativeAge };

export function feeLabel(minFee: { amountMinor: number; currency: string; basis: string } | null, feeUnknown: boolean): string {
  if (!minFee || feeUnknown) return "Price not published";
  return `From ${formatFee({ status: "known", amountMinor: minFee.amountMinor, currency: minFee.currency, basis: minFee.basis as "per_team" })}`;
}

export function verificationLabel(v: string) {
  return VERIFICATION_EXPLANATIONS[v as VerificationLevel]?.label ?? v;
}

export const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled", postponed: "Postponed", cancelled: "Cancelled", source_missing: "Listing not found at source", completed: "Completed",
};
export const REG_LABEL: Record<string, string> = {
  open: "Registration open", closed: "Registration closed", waitlist: "Waitlist", not_yet_open: "Registration not yet open", unknown: "Registration status not published",
};
export const TYPE_LABEL: Record<string, string> = { tournament: "Tournament", league: "League", clinic: "Clinic", combine: "Combine", other: "Event" };
