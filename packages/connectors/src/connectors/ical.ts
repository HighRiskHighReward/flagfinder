import ICAL from "ical.js";
import { addDays, classifySportScope, divisionHintsFromText, todayIn, type CandidateInput } from "@ff/core";
import type { ConnectorContext, DiscoveredRef, FetchResult, ParsedRecord, SourceConnector } from "../contract";

/**
 * Generic RFC 5545 iCalendar connector (structured data — preferred over HTML).
 * Config: { feedUrl, timezone, includeKeywords?: string[], organizerName?, countryCode, adminArea?, knownLocalities?: string[] }
 * Only facts present in the feed are used. Locality is taken from LOCATION text only when it
 * names a known locality; otherwise it stays unknown and the item goes to review.
 */
export interface IcalConfig {
  feedUrl?: string | null;
  timezone: string;
  includeKeywords?: string[];
  organizerName?: string | null;
  organizerUrl?: string | null;
  countryCode: string;
  adminArea?: string | null;
  knownLocalities?: string[];
  pastDaysToKeep?: number;
}

function cfg(c: Record<string, unknown>): IcalConfig { return c as unknown as IcalConfig; }

function localDate(t: ICAL.Time, tz: string): { date: string; time: string | null } {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (t.isDate) return { date: `${t.year}-${pad(t.month)}-${pad(t.day)}`, time: null };
  // Floating or TZID times: wall-clock fields are already local to the event's zone.
  if (t.zone && t.zone.tzid === "UTC") {
    const js = t.toJSDate();
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(js);
    const g = (k: string) => parts.find((p) => p.type === k)!.value;
    return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
  }
  return { date: `${t.year}-${pad(t.month)}-${pad(t.day)}`, time: `${pad(t.hour)}:${pad(t.minute)}` };
}

export const icalConnector: SourceConnector = {
  key: "ical",
  parserVersion: "ical-1.0.0",
  capabilities: { discovery: true, incremental: false, conditionalRequests: true },

  async *discover(ctx: ConnectorContext): AsyncIterable<DiscoveredRef> {
    const c = cfg(ctx.config);
    if (!c.feedUrl) throw new Error("ical connector: config.feedUrl is not set (source not yet verified)");
    yield { externalId: null, url: c.feedUrl };
  },

  async fetch(ref, ctx, conditional): Promise<FetchResult> {
    return ctx.http.get(ref.url, { etag: conditional?.etag, lastModified: conditional?.lastModified, accept: ["text/calendar", "text/plain;q=0.5"] });
  },

  async parse(raw): Promise<ParsedRecord[]> {
    const comp = new ICAL.Component(ICAL.parse(raw.body));
    return comp.getAllSubcomponents("vevent").map((ve) => {
      const get = (n: string) => { const v = ve.getFirstPropertyValue(n); return v == null ? null : String(v); };
      const ev = new ICAL.Event(ve);
      return {
        externalId: get("uid"),
        url: get("url") ?? raw.url,
        raw: {
          summary: ev.summary ?? null, description: get("description"), location: get("location"), categories: ve.getAllProperties("categories").flatMap((p) => p.getValues().map(String)),
          start: ev.startDate ? { iso: ev.startDate.toString(), isDate: ev.startDate.isDate, tzid: ev.startDate.zone?.tzid ?? null } : null,
          end: ev.endDate ? { iso: ev.endDate.toString(), isDate: ev.endDate.isDate, tzid: ev.endDate.zone?.tzid ?? null } : null,
          status: get("status"), lastModified: get("last-modified"), geo: ve.getFirstPropertyValue("geo") ?? null, hasRrule: !!ve.getFirstProperty("rrule"),
          _startTime: ev.startDate ?? null, _endTime: ev.endDate ?? null,
        },
      };
    });
  },

  async normalize(parsed, ctx): Promise<CandidateInput[]> {
    const c = cfg(ctx.config);
    const kw = (c.includeKeywords ?? ["flag football", "flag"]).map((k) => k.toLowerCase());
    const keepFrom = addDays(todayIn(c.timezone, ctx.now), -(c.pastDaysToKeep ?? 0));
    const out: CandidateInput[] = [];
    for (const p of parsed) {
      const r = p.raw as Record<string, unknown> & { _startTime: ICAL.Time | null; _endTime: ICAL.Time | null };
      const text = [r.summary, r.description, ...(r.categories as string[])].filter(Boolean).join(" \n ");
      if (!kw.some((k) => text.toLowerCase().includes(k))) continue;
      if (!r._startTime || !r.summary) continue;
      const ambiguities: NonNullable<CandidateInput["ambiguities"]> = [];
      const s = localDate(r._startTime, c.timezone);
      let endDate = s.date, endTime: string | null = null;
      if (r._endTime) {
        const e = localDate(r._endTime, c.timezone);
        endDate = r._startTime.isDate ? addDays(e.date, -1) : e.date; // DTEND is exclusive for all-day
        endTime = e.time;
        if (endDate < s.date) endDate = s.date;
      }
      if (s.date < keepFrom) continue;
      if (r.hasRrule) ambiguities.push({ field: "sessions", reason: "recurring_rule_needs_review", evidence: "RRULE present" });
      const loc = (r.location as string | null)?.trim() || null;
      const locality = loc && c.knownLocalities ? c.knownLocalities.find((l) => new RegExp(`\\b${l}\\b`, "i").test(loc)) ?? null : null;
      const geo = Array.isArray(r.geo) && r.geo.length === 2 ? { lat: Number(r.geo[0]), lon: Number(r.geo[1]) } : null;
      if (loc && !locality && !geo) ambiguities.push({ field: "venue.locality", reason: "locality_not_stated", evidence: loc });
      if (!loc) ambiguities.push({ field: "venue", reason: "location_not_published", evidence: null });
      const status = String(r.status ?? "").toUpperCase();
      const desc = (r.description as string | null)?.slice(0, 4000) ?? null;
      out.push({
        externalId: p.externalId, url: p.url,
        sourceUpdatedAt: r.lastModified ? new Date(String(r.lastModified)).toISOString() : null,
        name: String(r.summary).slice(0, 250),
        organizer: c.organizerName ? { name: c.organizerName, websiteUrl: c.organizerUrl ?? null } : null,
        eventType: /\bleague\b/i.test(text) ? "league" : /\btournament|jamboree|classic|cup\b/i.test(text) ? "tournament" : /\bclinic|camp\b/i.test(text) ? "clinic" : "other",
        sportScope: classifySportScope(text),
        startDate: s.date, endDate, startTime: s.time, endTime, timezone: c.timezone, datePrecision: "day",
        statusSignal: { schemaEventStatus: status === "CANCELLED" ? "https://schema.org/EventCancelled" : null, text: desc },
        description: desc,
        venues: loc ? [{
          name: loc.split(",")[0]!.slice(0, 200), addressLine1: loc.includes(",") ? loc.split(",").slice(1).join(",").trim().slice(0, 200) || null : null,
          locality, adminArea: c.adminArea ?? null, countryCode: c.countryCode,
          lat: geo?.lat ?? null, lon: geo?.lon ?? null, geoPrecision: geo ? "street" : "unknown",
          geocodeProvider: geo ? "source_published" : null, geocodeLicense: geo ? "source_published" : null,
        }] : [],
        divisions: divisionHintsFromText(`${r.summary} ${desc ?? ""}`),
        ambiguities,
      });
    }
    return out;
  },

  async health(ctx) {
    const c = cfg(ctx.config);
    return c.feedUrl ? { ok: true, detail: "feed configured" } : { ok: false, detail: "feedUrl not configured" };
  },
};
