/** Single source of truth for brand identity. Never hard-code the name elsewhere. */
export const brand = {
  name: "FlagFinder",
  tagline: "Find your next flag football tournament or league, with trustworthy details, a useful map, and information that stays current.",
  shortTagline: "Flag football tournaments & leagues, kept current.",
  domain: "flagfinder.example",
  defaultRegionSlug: "dfw",
  userAgent: "FlagFinderBot/1.0 (+https://flagfinder.onrender.com/coverage)",
} as const;
export type Brand = typeof brand;
