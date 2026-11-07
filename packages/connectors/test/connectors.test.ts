import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPoliteHttp, icalConnector, isBlockedAddress, jsonLdConnector, parseRobots, resetRateLimiters, robotsVerdict, safeFetch } from "../src";

const fx = (p: string) => readFileSync(fileURLToPath(new URL(`../fixtures/${p}`, import.meta.url)), "utf8");
const NOW = new Date("2027-03-01T12:00:00Z");
const icalCfg = { feedUrl: "https://city.example.org/cal.ics", timezone: "America/Chicago", countryCode: "US", adminArea: "TX", organizerName: "SYNTHETIC City Parks", knownLocalities: ["Plano", "Frisco", "Allen"] };
const ok = (body: string, url = "https://x.invalid/") => ({ kind: "ok" as const, url, status: 200, contentType: "text/calendar", body, etag: null, lastModified: null, fetchedAt: NOW });

describe("iCal connector (synthetic fixture)", () => {
  it("parses deterministically and keeps only flag-related events", async () => {
    const parsed = await icalConnector.parse(ok(fx("ical/synthetic-city-calendar.ics")), { config: icalCfg, now: NOW });
    expect(parsed).toHaveLength(6);
    const c = await icalConnector.normalize(parsed, { config: icalCfg, now: NOW });
    // "Story Time" and the tackle camp don't mention flag football → filtered out before ingest.
    expect(c.map((x) => x.externalId)).toEqual(["synthetic-1001@example.org", "synthetic-1002@example.org", "synthetic-1005@example.org", "synthetic-1006@example.org"]);
    // stable across runs
    expect(await icalConnector.normalize(await icalConnector.parse(ok(fx("ical/synthetic-city-calendar.ics")), { config: icalCfg, now: NOW }), { config: icalCfg, now: NOW })).toEqual(c);
  });
  it("all-day DTEND is exclusive; published GEO + locality kept with provenance", async () => {
    const c = await icalConnector.normalize(await icalConnector.parse(ok(fx("ical/synthetic-city-calendar.ics")), { config: icalCfg, now: NOW }), { config: icalCfg, now: NOW });
    const j = c[0]!;
    expect([j.startDate, j.endDate, j.startTime]).toEqual(["2027-03-13", "2027-03-14", null]);
    expect(j.venues![0]).toMatchObject({ locality: "Plano", lat: 33.0301, geocodeProvider: "source_published" });
    expect(j.divisions![0]).toMatchObject({ ageRuleType: "age_range", ageMin: 10, ageMax: 12, genderCategory: "girls", eligibilityOriginal: "Ages 10-12" });
    expect(j.registrationUrl ?? null).toBeNull(); // calendar URL is not a registration link
  });
  it("timed events on the DST-change day keep local wall time", async () => {
    const c = await icalConnector.normalize(await icalConnector.parse(ok(fx("ical/synthetic-city-calendar.ics")), { config: icalCfg, now: NOW }), { config: icalCfg, now: NOW });
    expect(c[1]).toMatchObject({ startDate: "2027-03-14", startTime: "09:00", endTime: "13:00", timezone: "America/Chicago" });
  });
  it("tackle is classified out of scope; CANCELLED is explicit evidence; RRULE → review", async () => {
    const broad = { ...icalCfg, includeKeywords: ["football"] };
    const all = await icalConnector.normalize(await icalConnector.parse(ok(fx("ical/synthetic-city-calendar.ics")), { config: broad, now: NOW }), { config: broad, now: NOW });
    expect(all.find((x) => x.externalId === "synthetic-1003@example.org")!.sportScope).toBe("tackle");
    const c = await icalConnector.normalize(await icalConnector.parse(ok(fx("ical/synthetic-city-calendar.ics")), { config: icalCfg, now: NOW }), { config: icalCfg, now: NOW });
    expect(c[2]!.statusSignal?.schemaEventStatus).toMatch(/EventCancelled/);
    expect(c[2]!.ambiguities?.map((a) => a.field)).toContain("venue.locality");
    expect(c[3]!.ambiguities?.map((a) => a.reason)).toContain("recurring_rule_needs_review");
  });
  it("refuses to run without a verified feed URL", async () => {
    const it = icalConnector.discover({ sourceId: "s", sourceKey: "k", config: { ...icalCfg, feedUrl: null }, http: createPoliteHttp({ ratePerMinute: 1 }), log: () => {}, now: NOW });
    await expect(it[Symbol.asyncIterator]().next()).rejects.toThrow(/feedUrl/);
  });
});

describe("JSON-LD connector (synthetic fixture)", () => {
  const cfg = { pageUrls: ["https://league.example.org/e/77"], timezone: "America/Chicago", countryCode: "US" };
  it("extracts schema.org events from @graph, ignores malformed blocks, converts offsets to local dates", async () => {
    const parsed = await jsonLdConnector.parse({ ...ok(fx("jsonld/synthetic-event-page.html")), contentType: "text/html" }, { config: cfg, now: NOW });
    expect(parsed).toHaveLength(1);
    const [c] = await jsonLdConnector.normalize(parsed, { config: cfg, now: NOW });
    expect(c).toMatchObject({ startDate: "2027-03-13", endDate: "2027-03-14", startTime: "08:00", sportScope: "flag", registrationUrl: "https://league.example.org/register/77" });
    expect(c!.venues![0]).toMatchObject({ locality: "Plano", postalCode: "75000", lat: 33.031 });
    expect(c!.divisions!.map((d) => d.name)).toEqual(["12U", "14U"]);
    // price is published but not mapped to divisions/basis → review, not guessed
    expect(c!.ambiguities!.map((a) => a.field)).toContain("fees");
    expect(c!.divisions!.every((d) => d.feeAmountMinor == null)).toBe(true);
    // injected text is carried as inert data only; nothing in the candidate can set verification
    expect(JSON.stringify(c)).not.toMatch(/verification/i);
  });
});

describe("robots.txt", () => {
  const rules = parseRobots(`User-agent: *\nDisallow: /private\nAllow: /private/calendar\nCrawl-delay: 10\n\nUser-agent: BadBot\nDisallow: /`);
  it("longest match wins; allow on tie", () => {
    expect(robotsVerdict(rules, "FlagFinderBot/0.1", "/private/x").allowed).toBe(false);
    expect(robotsVerdict(rules, "FlagFinderBot/0.1", "/private/calendar/ical").allowed).toBe(true);
    expect(robotsVerdict(rules, "FlagFinderBot/0.1", "/events").allowed).toBe(true);
    expect(robotsVerdict(rules, "FlagFinderBot/0.1", "/").crawlDelay).toBe(10);
    expect(robotsVerdict(rules, "BadBot/1.0", "/events").allowed).toBe(false);
  });
});

describe("SSRF protection", () => {
  it("blocks private, loopback, link-local, metadata and mapped ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"]) expect(isBlockedAddress(ip), ip).toBe(false);
  });
  it("rejects non-http schemes and credentials", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(/scheme/);
    await expect(safeFetch("ftp://example.com/")).rejects.toThrow(/scheme/);
    await expect(safeFetch("http://user:pw@example.com/")).rejects.toThrow(/credentials/);
  });
  it("rejects hostnames that resolve to private addresses (DNS checked)", async () => {
    await expect(safeFetch("http://evil.example/", { resolver: async () => ["10.0.0.5"] })).rejects.toThrow(/blocked address/);
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(/blocked/);
    await expect(safeFetch("http://localhost:3000/")).rejects.toThrow(/blocked/);
  });

  let server: Server; let port = 0;
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/redirect-private") { res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); return res.end(); }
      if (req.url === "/redirect-loop") { res.writeHead(302, { location: "/redirect-loop" }); return res.end(); }
      if (req.url === "/big") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("x".repeat(3000)); }
      if (req.url === "/html") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<p>hi</p>"); }
      if (req.url === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("User-agent: *\nDisallow: /blocked\n"); }
      if (req.url === "/429") { res.writeHead(429, { "retry-after": "120" }); return res.end(); }
      if (req.url === "/cal") {
        if (req.headers["if-none-match"] === '"v1"') { res.writeHead(304); return res.end(); }
        res.writeHead(200, { "content-type": "text/calendar", etag: '"v1"' }); return res.end("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
      }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => resetRateLimiters());

  it("re-validates every redirect hop (redirect to metadata IP is blocked)", async () => {
    await expect(safeFetch(`http://127.0.0.1:${port}/redirect-private`, { unsafeAllowLoopback: true })).rejects.toThrow(/blocked address 169\.254/);
  });
  it("caps redirects, size and content types", async () => {
    await expect(safeFetch(`http://127.0.0.1:${port}/redirect-loop`, { unsafeAllowLoopback: true })).rejects.toThrow(/too many redirects/);
    await expect(safeFetch(`http://127.0.0.1:${port}/big`, { unsafeAllowLoopback: true, maxBytes: 1000 })).rejects.toThrow(/larger/);
    await expect(safeFetch(`http://127.0.0.1:${port}/html`, { unsafeAllowLoopback: true, allowedContentTypes: ["text/calendar"] })).rejects.toThrow(/content-type/);
  });
  it("polite HTTP: robots disallow, 429 Retry-After, conditional 304, 404 missing", async () => {
    const http = createPoliteHttp({ ratePerMinute: 6000, fetchOptions: { unsafeAllowLoopback: true }, robotsCache: new Map() });
    expect(await http.get(`http://127.0.0.1:${port}/blocked`)).toMatchObject({ kind: "disallowed" });
    expect(await http.get(`http://127.0.0.1:${port}/429`)).toMatchObject({ kind: "rate_limited", retryAfterMs: 120_000 });
    const first = await http.get(`http://127.0.0.1:${port}/cal`);
    expect(first).toMatchObject({ kind: "ok", etag: '"v1"' });
    expect(await http.get(`http://127.0.0.1:${port}/cal`, { etag: '"v1"' })).toMatchObject({ kind: "not_modified" });
    expect(await http.get(`http://127.0.0.1:${port}/nope`)).toMatchObject({ kind: "missing", status: 404 });
  });
});

describe("recorded real robots.txt excerpt (CivicPlus city sites, observed 2026-11-07)", () => {
  it("iCal export and RSS feeds are disallowed for our bot; crawl-delay is 10s; Baidu/Yandex fully blocked", () => {
    const rules = parseRobots(fx("recorded/robots/civicplus-user-agent-star-excerpt.txt"));
    const ua = "FlagFinderBot/0.1 (+https://flagfinder.example/about/bot)";
    expect(robotsVerdict(rules, ua, "/common/modules/icalendar/getICS.aspx?CID=1").allowed).toBe(false);
    expect(robotsVerdict(rules, ua, "/RSS.aspx").allowed).toBe(false);
    expect(robotsVerdict(rules, ua, "/").crawlDelay).toBe(10);
    expect(robotsVerdict(rules, "Baiduspider", "/anything").allowed).toBe(false);
  });
});
