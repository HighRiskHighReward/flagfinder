import { diffDays } from "./dates";
import { normalizeText } from "./materiality";
import { haversineKm } from "./geo";

export interface DedupEventView {
  id: string;
  name: string;
  organizerName: string | null;
  startDate: string | null;
  endDate: string | null;
  editionId: string | null;
  seriesId: string | null;
  registrationUrl: string | null;
  location: { lat: number; lon: number } | null;
  /** (sourceKey, externalId) pairs that back this event. */
  externalIds: string[];
}

export interface DedupThresholds { autoMerge: number; review: number }
export const DEFAULT_THRESHOLDS: DedupThresholds = { autoMerge: 0.9, review: 0.6 };

export type DedupDecision = "auto_merge" | "review" | "distinct";

export interface DedupScore {
  score: number;
  decision: DedupDecision;
  features: Record<string, number | boolean | string | null>;
  blockedReason?: string;
}

const STOP = new Set(["the", "a", "an", "of", "and", "flag", "football", "tournament", "league", "annual"]);

function trigrams(s: string): Set<string> {
  const t = `  ${normalizeText(s).replace(/[^a-z0-9 ]/g, "")} `;
  const out = new Set<string>();
  for (const w of t.split(" ").filter(Boolean)) {
    const p = `  ${w} `;
    for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

/** pg_trgm-compatible similarity (|A∩B| / |A∪B|). */
export function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function significantTokens(s: string): string[] {
  return normalizeText(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w && !STOP.has(w));
}

export function registrationDomain(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

/** Blocking: only pairs that share a ±3 day window AND a ~25km cell, or the same registration domain, are scored. */
export function isCandidatePair(a: DedupEventView, b: DedupEventView): boolean {
  if (a.id === b.id) return false;
  const regA = registrationDomain(a.registrationUrl), regB = registrationDomain(b.registrationUrl);
  if (regA && regA === regB && regA.length > 0) return true;
  if (!a.startDate || !b.startDate) return false;
  if (Math.abs(diffDays(a.startDate, b.startDate)) > 3) return false;
  if (!a.location || !b.location) return true; // same window, location unknown: still worth scoring
  return haversineKm(a.location, b.location) <= 25;
}

export function scorePair(a: DedupEventView, b: DedupEventView, t: DedupThresholds = DEFAULT_THRESHOLDS): DedupScore {
  // Hard rules: different editions or different weekends are never the same event.
  if (a.editionId && b.editionId && a.editionId !== b.editionId) {
    return { score: 0, decision: "distinct", features: {}, blockedReason: "different_edition" };
  }
  if (a.startDate && b.startDate && Math.abs(diffDays(a.startDate, b.startDate)) > 3) {
    return { score: 0, decision: "distinct", features: {}, blockedReason: "different_dates" };
  }
  if (a.startDate && b.startDate && a.startDate.slice(0, 4) !== b.startDate.slice(0, 4)) {
    return { score: 0, decision: "distinct", features: {}, blockedReason: "different_year" };
  }

  const sameExternal = a.externalIds.some((x) => b.externalIds.includes(x));
  const nameSim = trigramSimilarity(a.name, b.name);
  const tokA = new Set(significantTokens(a.name)), tokB = significantTokens(b.name);
  const tokenOverlap = tokB.length && tokA.size ? tokB.filter((w) => tokA.has(w)).length / Math.max(tokA.size, tokB.length) : 0;
  const organizer = a.organizerName && b.organizerName ? trigramSimilarity(a.organizerName, b.organizerName) : null;
  const dateOverlap = a.startDate && b.startDate
    ? (a.startDate === b.startDate && (a.endDate ?? a.startDate) === (b.endDate ?? b.startDate) ? 1 : Math.max(0, 1 - Math.abs(diffDays(a.startDate, b.startDate)) / 3))
    : 0;
  const distKm = a.location && b.location ? haversineKm(a.location, b.location) : null;
  const venue = distKm === null ? 0.5 : distKm < 0.3 ? 1 : distKm < 2 ? 0.7 : distKm < 10 ? 0.3 : 0;
  const regA = a.registrationUrl ? normalizeUrl(a.registrationUrl) : null;
  const regB = b.registrationUrl ? normalizeUrl(b.registrationUrl) : null;
  // Absent signal is neutral (0.5), not a mismatch.
  const regMatch = regA && regB ? (regA === regB ? 1 : registrationDomain(regA) === registrationDomain(regB) ? 0.4 : 0) : 0.5;

  let score: number;
  if (sameExternal) score = 1;
  else {
    score = 0.3 * Math.max(nameSim, tokenOverlap) + 0.25 * dateOverlap + 0.2 * venue + 0.15 * regMatch + 0.1 * (organizer ?? 0.5);
    if (regMatch === 1 && dateOverlap === 1) score = Math.max(score, 0.92);
  }
  score = Math.round(score * 1000) / 1000;
  const decision: DedupDecision = score >= t.autoMerge ? "auto_merge" : score >= t.review ? "review" : "distinct";
  return {
    score,
    decision,
    features: { sameExternal, nameSim: round(nameSim), tokenOverlap: round(tokenOverlap), organizer: organizer === null ? null : round(organizer), dateOverlap: round(dateOverlap), venueKm: distKm === null ? null : round(distKm), regMatch },
  };
}

function round(n: number) { return Math.round(n * 1000) / 1000; }

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    for (const p of [...url.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/.test(p)) url.searchParams.delete(p);
    return `${url.protocol}//${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}${url.search}`;
  } catch {
    return u.trim();
  }
}
