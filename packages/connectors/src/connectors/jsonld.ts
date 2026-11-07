import { classifySportScope, divisionHintsFromText, todayIn, type CandidateInput } from "@ff/core";
import type { ConnectorContext, DiscoveredRef, FetchResult, ParsedRecord, SourceConnector } from "../contract";

/**
 * schema.org Event JSON-LD connector for permitted pages. Config: { pageUrls: string[], timezone, countryCode }.
 * Reads only <script type="application/ld+json"> blocks; never executes page scripts.
 */
export interface JsonLdConfig { pageUrls?: string[]; timezone: string; countryCode: string }

const EVENT_TYPES = new Set(["Event", "SportsEvent"]);

export function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { out.push(JSON.parse(m[1]!.trim())); } catch { /* malformed block: ignore, never guess */ }
  }
  return out;
}

function flatten(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    const self = [o["@type"]].flat().some((t) => EVENT_TYPES.has(String(t))) ? [o] : [];
    return [...self, ...(o["@graph"] ? flatten(o["@graph"]) : [])];
  }
  return [];
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function toLocal(v: string | null, tz: string): { date: string | null; time: string | null; precision: "day" | "month" | "tbd" } {
  if (!v) return { date: null, time: null, precision: "tbd" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { date: v, time: null, precision: "day" };
  if (/^\d{4}-\d{2}$/.test(v)) return { date: `${v}-01`, time: null, precision: "month" };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { date: null, time: null, precision: "tbd" };
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) { // no offset: wall time in source tz
    const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    return m ? { date: m[1]!, time: m[2]!, precision: "day" } : { date: null, time: null, precision: "tbd" };
  }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (k: string) => parts.find((p) => p.type === k)!.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}`, precision: "day" };
}

export const jsonLdConnector: SourceConnector = {
  key: "jsonld",
  parserVersion: "jsonld-1.0.0",
  capabilities: { discovery: false, incremental: false, conditionalRequests: true },
  async *discover(ctx: ConnectorContext): AsyncIterable<DiscoveredRef> {
    for (const url of (ctx.config as unknown as JsonLdConfig).pageUrls ?? []) yield { externalId: null, url };
  },
  async fetch(ref, ctx, conditional): Promise<FetchResult> {
    return ctx.http.get(ref.url, { etag: conditional?.etag, lastModified: conditional?.lastModified, accept: ["text/html"] });
  },
  async parse(raw): Promise<ParsedRecord[]> {
    return extractJsonLd(raw.body).flatMap(flatten).map((e) => ({ externalId: str(e["@id"]) ?? str(e.identifier), url: str(e.url) ?? raw.url, raw: e }));
  },
  async normalize(parsed, ctx): Promise<CandidateInput[]> {
    const c = ctx.config as unknown as JsonLdConfig;
    const today = todayIn(c.timezone, ctx.now);
    return parsed.flatMap((p): CandidateInput[] => {
      const e = p.raw;
      const name = str(e.name);
      if (!name) return [];
      const s = toLocal(str(e.startDate), c.timezone), en = toLocal(str(e.endDate), c.timezone);
      if (s.date && (en.date ?? s.date) < today) return [];
      const text = `${name} ${str(e.description) ?? ""} ${str(e.sport) ?? ""}`;
      const locs = [e.location].flat().filter(Boolean) as Record<string, unknown>[];
      const ambiguities: NonNullable<CandidateInput["ambiguities"]> = [];
      const offers = [e.offers].flat().filter(Boolean) as Record<string, unknown>[];
      if (offers.length) ambiguities.push({ field: "fees", reason: "offer_needs_division_and_basis_mapping", evidence: offers.map((o) => `${o.price ?? "?"} ${o.priceCurrency ?? ""}`).join("; ") });
      return [{
        externalId: p.externalId, url: /^https?:\/\//.test(p.url) ? p.url : (c.pageUrls?.[0] ?? p.url), name: name.slice(0, 250),
        organizer: (e.organizer as Record<string, unknown> | undefined)?.name ? { name: String((e.organizer as Record<string, unknown>).name).slice(0, 200), websiteUrl: str((e.organizer as Record<string, unknown>).url) } : null,
        eventType: /league/i.test(text) ? "league" : /tournament|cup|classic|bowl/i.test(text) ? "tournament" : "other",
        sportScope: classifySportScope(text), startDate: s.date, endDate: en.date ?? s.date, startTime: s.time, endTime: en.time, timezone: c.timezone, datePrecision: s.precision,
        statusSignal: { schemaEventStatus: str(e.eventStatus), text: null },
        description: str(e.description)?.slice(0, 4000) ?? null,
        registrationUrl: str(offers[0]?.url) && /^https?:\/\//.test(str(offers[0]?.url)!) ? str(offers[0]?.url) : null,
        venues: locs.filter((l) => str(l.name)).map((l) => {
          const a = (typeof l.address === "object" ? l.address : {}) as Record<string, unknown>;
          const g = (l.geo ?? {}) as Record<string, unknown>;
          const lat = Number(g.latitude), lon = Number(g.longitude);
          const hasGeo = Number.isFinite(lat) && Number.isFinite(lon) && g.latitude != null;
          return {
            name: str(l.name)!.slice(0, 200), addressLine1: str(a.streetAddress), locality: str(a.addressLocality), adminArea: str(a.addressRegion), postalCode: str(a.postalCode),
            countryCode: (str(a.addressCountry)?.length === 2 ? str(a.addressCountry)!.toUpperCase() : c.countryCode),
            lat: hasGeo ? lat : null, lon: hasGeo ? lon : null, geoPrecision: hasGeo ? "street" : "unknown", geocodeProvider: hasGeo ? "source_published" : null, geocodeLicense: hasGeo ? "source_published" : null,
          };
        }),
        divisions: divisionHintsFromText(text),
        ambiguities,
      }];
    });
  },
  async health(ctx) { return (ctx.config as unknown as JsonLdConfig).pageUrls?.length ? { ok: true, detail: "pages configured" } : { ok: false, detail: "no pageUrls configured" }; },
};
