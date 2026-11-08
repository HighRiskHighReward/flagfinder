import { todayIn, type CandidateInput } from "@ff/core";
import type { ConnectorContext, DiscoveredRef, FetchResult, ParsedRecord, SourceConnector } from "../contract";

/**
 * iFlag tournament listings (https://iflag.org/sanctioned-tournaments/, /tournaments/).
 * Permission basis: robots.txt allows general agents; terms contain no automated-access or
 * republishing restriction (checked 2026-11-08, docs/SOURCE_ACCESS.md, ADR-023).
 *
 * The pages are WordPress + JetEngine listing grids. Each `jet-listing-grid__item` carries a
 * stable `data-post-id` and a fixed field order: name, age groups, organizer, start, end,
 * "City, ST", sanction status. Static HTML only; page scripts are never executed.
 *
 * Config: { pageUrls: string[], timezone, countryCode }.
 */
export interface IflagConfig { pageUrls?: string[]; timezone: string; countryCode: string }

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/** "Sat, Nov 14, 2026" → "2026-11-14"; anything else → null (never guessed). */
export function parseIflagDate(s: string | undefined): string | null {
  const m = s?.match(/^(?:[A-Za-z]{3},\s*)?([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const mm = MONTHS[m[1]!.toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[2]!.padStart(2, "0")}` : null;
}

const decode = (s: string) => s
  .replace(/<[^>]+>/g, "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();

export interface IflagItem { postId: string; fields: string[]; link: string | null }

export function extractIflagItems(html: string): IflagItem[] {
  const seen = new Set<string>();
  const out: IflagItem[] = [];
  const chunks = html.split(/<div class="jet-listing-grid__item /).slice(1);
  for (const chunk of chunks) {
    const postId = chunk.match(/data-post-id="(\d+)"/)?.[1];
    if (!postId || seen.has(postId)) continue;
    seen.add(postId);
    const fields = [...chunk.matchAll(/jet-listing-dynamic-field__content"\s*>([\s\S]*?)<\/div>/g)].map((m) => decode(m[1]!)).filter(Boolean);
    const link = chunk.match(/<a[^>]+href="(https?:\/\/[^"]+)"/)?.[1] ?? null;
    out.push({ postId, fields: fields.slice(0, 7), link: link ? decode(link) : null });
  }
  return out;
}

const stripLabel = (s: string | undefined, label: RegExp) => (s ? s.replace(label, "").trim() : "");

/** Age-group labels iFlag publishes → divisions. Only what the label states; ages never inferred. */
export function iflagDivision(label: string): NonNullable<CandidateInput["divisions"]>[number] {
  const l = label.toLowerCase();
  const gender = /girls/.test(l) ? "girls" : /women/.test(l) ? "womens" : /coed|co-ed/.test(l) ? "coed" : /\bmens?\b/.test(l) ? "mens" : "unknown";
  const level = /high school/.test(l) ? "high_school" : /youth|\d+u\b/.test(l) ? "youth" : /adult|over \d+|under \d+/.test(l) ? "adult" : "unknown";
  const format = /\b7v7\b/.test(l) ? "7v7" : /\b5v5\b/.test(l) ? "5v5" : "unknown";
  const over = l.match(/^over (\d{2})$/);
  return {
    name: label.slice(0, 200), sportScope: "flag", genderCategory: gender, levelCategory: level, format,
    ageRuleType: over ? "age_range" : "unknown", ageMin: over ? Number(over[1]) : null, ageMax: null,
    eligibilityOriginal: label.slice(0, 500),
  };
}

export const iflagConnector: SourceConnector = {
  key: "iflag",
  parserVersion: "iflag-1.0.0",
  capabilities: { discovery: false, incremental: false, conditionalRequests: true },
  async *discover(ctx: ConnectorContext): AsyncIterable<DiscoveredRef> {
    for (const url of (ctx.config as unknown as IflagConfig).pageUrls ?? []) yield { externalId: null, url };
  },
  async fetch(ref, ctx, conditional): Promise<FetchResult> {
    return ctx.http.get(ref.url, { etag: conditional?.etag, lastModified: conditional?.lastModified, accept: ["text/html"] });
  },
  async parse(raw): Promise<ParsedRecord[]> {
    return extractIflagItems(raw.body).map((it) => ({ externalId: `iflag:${it.postId}`, url: raw.url, raw: { ...it } }));
  },
  async normalize(parsed, ctx): Promise<CandidateInput[]> {
    const c = ctx.config as unknown as IflagConfig;
    const today = todayIn(c.timezone, ctx.now);
    return parsed.flatMap((p): CandidateInput[] => {
      const { fields, link } = p.raw as unknown as IflagItem;
      const [name, ages, org, start, end, place, sanction] = fields;
      if (!name || name.length < 2) return [];
      const startDate = parseIflagDate(start), endDate = parseIflagDate(end) ?? startDate;
      if (!startDate) return [];
      if ((endDate ?? startDate) < today) return [];
      const ambiguities: NonNullable<CandidateInput["ambiguities"]> = [];
      const host = link ? new URL(link).hostname.replace(/^www\./, "") : null;
      // iFlag-hosted events link to their own detail page; others link to the organizer.
      const iflagHosted = host === "iflag.org";
      // ZortsSports' terms forbid deep links into their service (docs/SOURCE_ACCESS.md) — don't republish those.
      const linkUsable = !!link && host !== "zortssports.com";
      if (link && !linkUsable) ambiguities.push({ field: "registrationUrl", reason: "registration_link_on_restricted_host", evidence: host });
      const placeM = place?.match(/^(.+?),\s*([A-Z]{2})$/);
      const ageLabels = stripLabel(ages, /^Age Groups:\s*/i).split(/,\s*/).filter(Boolean);
      const orgName = stripLabel(org, /^Organized by:\s*/i);
      return [{
        externalId: p.externalId,
        url: iflagHosted && link ? link : p.url,
        name: name.slice(0, 250),
        organizer: orgName ? { name: orgName.slice(0, 200), websiteUrl: linkUsable && !iflagHosted ? new URL(link!).origin : (iflagHosted ? "https://iflag.org" : null) } : null,
        eventType: "tournament",
        sportScope: "flag",
        startDate, endDate, startTime: null, endTime: null, timezone: c.timezone, datePrecision: "day",
        statusSignal: { schemaEventStatus: null, text: null },
        description: sanction ? `iFlag status: ${sanction}.`.slice(0, 5000) : null,
        registrationUrl: linkUsable ? link : null,
        venues: placeM ? [{
          name: `${placeM[1]}, ${placeM[2]} (venue not listed)`, locality: placeM[1]!, adminArea: placeM[2]!, countryCode: c.countryCode,
          lat: null, lon: null, geoPrecision: "unknown", geocodeProvider: null, geocodeLicense: null,
        }] : [],
        divisions: ageLabels.map(iflagDivision),
        ambiguities,
      }];
    });
  },
  async health(ctx) { return (ctx.config as unknown as IflagConfig).pageUrls?.length ? { ok: true, detail: "pages configured" } : { ok: false, detail: "no pageUrls configured" }; },
};
