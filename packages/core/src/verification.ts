import { VERIFICATION_LEVELS, type VerificationLevel } from "./types";

export function levelRank(l: VerificationLevel): number { return VERIFICATION_LEVELS.indexOf(l); }

export interface VerificationInputs {
  current: VerificationLevel;
  successfulSourceCount: number; // distinct sources that fetched+parsed this event successfully
  organizerConfirmed: boolean;   // an approved organizer claim confirmed the details
  adminVerified: boolean;
}

/**
 * Computes the verification level. A successful fetch alone can at most produce
 * `source_checked` (one source) or `multi_source_corroborated` (2+); it never yields
 * `organizer_confirmed` or `admin_verified`, which require human actions.
 */
export function computeVerification(i: VerificationInputs): VerificationLevel {
  let level: VerificationLevel = i.successfulSourceCount >= 2 ? "multi_source_corroborated" : i.successfulSourceCount === 1 ? "source_checked" : "awaiting_verification";
  if (i.organizerConfirmed) level = "organizer_confirmed";
  if (i.adminVerified) level = "admin_verified";
  // Human-earned levels are sticky: re-ingestion never downgrades them.
  if ((i.current === "organizer_confirmed" || i.current === "admin_verified") && levelRank(i.current) > levelRank(level)) level = i.current;
  return level;
}

export const VERIFICATION_EXPLANATIONS: Record<VerificationLevel, { label: string; meaning: string }> = {
  discovered_unverified: { label: "Discovered", meaning: "We found a reference to this event but have not confirmed the details at a source." },
  awaiting_verification: { label: "Awaiting verification", meaning: "We have a link but couldn't read its contents yet. Details may be incomplete." },
  source_checked: { label: "Source checked", meaning: "We fetched and parsed the organizer's or platform's published page. We did not contact the organizer." },
  multi_source_corroborated: { label: "Corroborated", meaning: "Two or more independent published sources agree on the key details." },
  organizer_confirmed: { label: "Organizer confirmed", meaning: "A verified organizer confirmed these details through their claimed listing." },
  admin_verified: { label: "Verified by staff", meaning: "A FlagFinder moderator reviewed these details against the published sources." },
};
