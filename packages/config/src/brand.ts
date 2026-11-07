/** Single source of truth for brand identity. Never hard-code the name elsewhere. */
export const brand = {
  name: "FlagFinder",
  tagline: "Find your next flag football tournament or league, with trustworthy details, a useful map, and information that stays current.",
  shortTagline: "Flag football tournaments & leagues, kept current.",
  domain: "flagfinder.example",
  defaultRegionSlug: "dfw",
  userAgent: "FlagFinderBot/0.1 (+https://flagfinder.example/about/bot)",
} as const;
export type Brand = typeof brand;
