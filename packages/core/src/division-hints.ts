import type { CandidateInput } from "./candidate";

/**
 * Deterministic, conservative division hints from published text (titles/descriptions).
 * Returns a division only when an age rule is explicitly stated; wording is kept verbatim.
 * Never infers fees, formats or levels that aren't written.
 */
export function divisionHintsFromText(text: string): NonNullable<CandidateInput["divisions"]> {
  const out: NonNullable<CandidateInput["divisions"]> = [];
  const gender = /\bgirls?\b/i.test(text) ? "girls" : /\bboys?\b/i.test(text) ? "boys" : /\bco-?ed\b/i.test(text) ? "coed" : /\bwomen'?s\b/i.test(text) ? "womens" : /\bmen'?s\b/i.test(text) ? "mens" : "unknown";
  const level = /\badult|men'?s|women'?s\b/i.test(text) ? "adult" : /\bhigh school\b/i.test(text) ? "high_school" : /\byouth|kids|\d{1,2}u\b|ages? \d/i.test(text) ? "youth" : "unknown";
  const format = /\b5\s?v\s?5|5-on-5\b/i.test(text) ? "5v5" : /\b6\s?v\s?6\b/i.test(text) ? "6v6" : /\b7\s?v\s?7|7-on-7\b/i.test(text) ? "7v7" : "unknown";
  const base = { genderCategory: gender, genderLabelOriginal: gender === "unknown" ? null : text.match(/\b(girls?|boys?|co-?ed|women'?s|men'?s)\b/i)?.[0] ?? null, levelCategory: level, format } as const;
  const range = text.match(/\bages?\s+(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\b/i);
  if (range) {
    const a = +range[1]!, b = +range[2]!;
    if (a >= 3 && b <= 99 && b >= a) out.push({ name: range[0], ...base, ageRuleType: "age_range", ageMin: a, ageMax: b, eligibilityOriginal: range[0] });
  }
  for (const m of text.matchAll(/\b(\d{1,2})\s?U\b/g)) {
    const n = +m[1]!;
    if (n >= 5 && n <= 19) out.push({ name: m[0], ...base, ageRuleType: "age_under", ageMin: null, ageMax: n, eligibilityOriginal: m[0] });
  }
  if (!out.length && (gender !== "unknown" || level === "adult")) out.push({ name: [base.genderLabelOriginal, level === "adult" ? "Adult" : null].filter(Boolean).join(" ") || "Open", ...base, ageRuleType: level === "adult" ? "unknown" : "unknown", eligibilityOriginal: null });
  return out;
}
