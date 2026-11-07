import type { SportScope } from "./types";

/** Flag-only scope classification from published wording. */
export function classifySportScope(text: string): SportScope {
  const t = text.toLowerCase();
  const flag = /\bflag\b|flag[- ]football|nfl flag/.test(t);
  const tackle = /\btackle\b|full[- ]pads|pads required/.test(t);
  const sevenOnSeven = /\b7\s?(v|on|-on-)\s?7\b/.test(t);
  if (flag && tackle) return "mixed";
  if (flag) return "flag";
  if (tackle) return "tackle";
  if (sevenOnSeven) return "7v7_passing_non_flag";
  return "unknown";
}

export function isPublishableScope(s: SportScope): boolean {
  return s === "flag" || s === "mixed";
}
