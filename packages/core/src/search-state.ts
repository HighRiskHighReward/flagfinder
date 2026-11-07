import { z } from "zod";
import { addDays, thisWeekend } from "./dates";

/**
 * Search state <-> URL. The URL is the source of truth: every filter, sort, page and the
 * "search this area" viewport serialize here, in a canonical key order.
 */
export const SORTS = ["soonest", "nearest", "price", "closing", "discovered", "updated", "best"] as const;
export type Sort = (typeof SORTS)[number];
export const CHIPS = ["weekend", "next30", "girls", "youth", "closing", "leagues"] as const;
export type Chip = (typeof CHIPS)[number];
export const UNKNOWABLE = ["gender", "level", "format", "comp", "fee", "io", "reg", "age", "guarantee", "location"] as const;
export type Unknowable = (typeof UNKNOWABLE)[number];

const csv = <T extends readonly [string, ...string[]]>(vals: T) =>
  z.string().optional().transform((s) => (s ? s.split(",").filter((x): x is T[number] => (vals as readonly string[]).includes(x)) : []));
const num = z.coerce.number().finite().optional().catch(undefined);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined);

export const searchStateSchema = z.object({
  q: z.string().max(120).optional().catch(undefined),
  region: z.string().regex(/^[a-z0-9-]{2,40}$/).optional().catch(undefined),
  country: z.string().regex(/^[A-Z]{2}$/).optional().catch(undefined),
  postal: z.string().max(16).optional().catch(undefined),
  lat: num, lon: num,
  radius: z.coerce.number().int().min(1).max(500).optional().catch(undefined),
  unit: z.enum(["mi", "km"]).optional().catch(undefined),
  scope: z.enum(["region", "national", "international"]).optional().catch(undefined),
  from: isoDate, to: isoDate,
  ageMin: z.coerce.number().int().min(3).max(99).optional().catch(undefined),
  ageMax: z.coerce.number().int().min(3).max(99).optional().catch(undefined),
  gender: csv(["girls", "boys", "coed", "womens", "mens", "other"] as const),
  level: csv(["youth", "high_school", "collegiate", "adult"] as const),
  type: csv(["tournament", "league", "clinic", "combine", "other"] as const),
  format: csv(["5v5", "6v6", "7v7", "other"] as const),
  comp: csv(["recreational", "competitive", "elite"] as const),
  reg: csv(["open", "closed", "waitlist", "not_yet_open"] as const),
  closingDays: z.coerce.number().int().min(1).max(90).optional().catch(undefined),
  feeMax: z.coerce.number().int().min(0).optional().catch(undefined), // minor units
  currency: z.string().regex(/^[A-Z]{3}$/).optional().catch(undefined),
  basis: csv(["per_team", "per_player", "per_family"] as const),
  io: csv(["indoor", "outdoor", "both"] as const),
  guarantee: z.coerce.number().int().min(1).max(20).optional().catch(undefined),
  organizer: z.string().uuid().optional().catch(undefined),
  verif: z.enum(["source_checked", "multi_source_corroborated", "organizer_confirmed", "admin_verified"]).optional().catch(undefined),
  freshDays: z.coerce.number().int().min(1).max(365).optional().catch(undefined),
  unk: csv(UNKNOWABLE),
  bbox: z.string().regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/).optional().catch(undefined),
  sort: z.enum(SORTS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).optional().catch(undefined),
  chips: csv(CHIPS),
});

export type SearchState = z.infer<typeof searchStateSchema>;

const ORDER: (keyof SearchState)[] = [
  "q", "region", "country", "postal", "lat", "lon", "radius", "unit", "scope", "from", "to", "ageMin", "ageMax",
  "gender", "level", "type", "format", "comp", "reg", "closingDays", "feeMax", "currency", "basis", "io", "guarantee",
  "organizer", "verif", "freshDays", "unk", "chips", "bbox", "sort", "page",
];

export function parseSearchState(params: URLSearchParams | Record<string, string | string[] | undefined>): SearchState {
  const obj: Record<string, string> = {};
  if (params instanceof URLSearchParams) params.forEach((v, k) => { obj[k] = v; });
  else for (const [k, v] of Object.entries(params)) if (v !== undefined) obj[k] = Array.isArray(v) ? v.join(",") : v;
  return searchStateSchema.parse(obj);
}

export function serializeSearchState(s: SearchState): string {
  const p = new URLSearchParams();
  for (const k of ORDER) {
    const v = s[k];
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) { if (v.length) p.set(k, [...v].sort().join(",")); continue; }
    if (k === "page" && v === 1) continue;
    p.set(k, String(v));
  }
  return p.toString();
}

export interface ResolvedSearch extends SearchState {
  from: string;
  to: string | undefined;
  sort: Sort;
  page: number;
  regionSlug: string | undefined;
}

/** Apply defaults and quick chips. Default: upcoming DFW events, soonest first. */
export function resolveSearch(s: SearchState, today: string): ResolvedSearch {
  const r: ResolvedSearch = { ...s, from: s.from ?? today, to: s.to, sort: s.sort ?? "soonest", page: s.page ?? 1, regionSlug: undefined };
  for (const chip of s.chips) {
    if (chip === "weekend") { const w = thisWeekend(today); r.from = w.from; r.to = w.to; }
    if (chip === "next30") { r.from = today; r.to = addDays(today, 30); }
    if (chip === "girls" && !r.gender.includes("girls")) r.gender = [...r.gender, "girls"];
    if (chip === "youth" && !r.level.includes("youth")) r.level = [...r.level, "youth"];
    if (chip === "closing") r.closingDays = r.closingDays ?? 14;
    if (chip === "leagues" && !r.type.includes("league")) r.type = [...r.type, "league"];
  }
  if (r.from < today && !s.from) r.from = today;
  const hasPoint = r.lat !== undefined && r.lon !== undefined;
  if (!r.bbox && !hasPoint && !r.postal && r.scope !== "national" && r.scope !== "international") r.regionSlug = r.region ?? "dfw";
  if (r.ageMin !== undefined && r.ageMax === undefined) r.ageMax = r.ageMin;
  if (r.ageMax !== undefined && r.ageMin === undefined) r.ageMin = r.ageMax;
  if (r.ageMin !== undefined && r.ageMax !== undefined && r.ageMin > r.ageMax) [r.ageMin, r.ageMax] = [r.ageMax, r.ageMin];
  return r;
}

/** The never-restrictive saved preset from §5.2. */
export const PRESETS = [
  { id: "girls-10-12-plano", label: "Girls 10–12 near Plano", state: { region: "plano", gender: ["girls"], ageMin: 10, ageMax: 12, radius: 25, unit: "mi" } as Partial<SearchState> },
] as const;
