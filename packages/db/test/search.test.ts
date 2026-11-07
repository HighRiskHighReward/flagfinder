import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { matchAge, parseSearchState, type AgeRuleType } from "@ff/core";
import { ingestCandidate } from "../src/ingest";
import { searchEvents } from "../src/search";
import { closePools } from "../src/client";
import { candidate, db, makeSource, truncateAll } from "./helpers";

const NOW = new Date("2027-03-01T18:00:00Z"); // 2027-03-01 local Chicago
const q = (s: string, showSynthetic = true) => searchEvents(db(), parseSearchState(new URLSearchParams(s)), { showSynthetic, now: NOW });
const plano = { lat: 33.03, lon: -96.68 };
const venue = (name: string, locality: string, ll: { lat: number; lon: number } | null) => ({
  name, locality, adminArea: "TX", countryCode: "US", lat: ll?.lat ?? null, lon: ll?.lon ?? null,
  geoPrecision: ll ? "street" as const : "unknown" as const, geocodeProvider: ll ? "source_published" : null, geocodeLicense: ll ? "source_published" : null,
});

beforeAll(async () => {
  await truncateAll();
  const s = await makeSource("s1");
  const add = (o: Parameters<typeof candidate>[0]) => ingestCandidate(db(), { source: s, candidate: candidate(o), parserVersion: "1" });
  // girls 10–12 in Plano, within 30 days
  await add({ externalId: "girls-plano", name: "Plano Girls Spring Flag", startDate: "2027-03-13", endDate: "2027-03-14", venues: [venue("Oak Point", "Plano", plano)] });
  // multi-day event starting before range (Feb 27 – Mar 2)
  await add({ externalId: "multi", name: "Long Weekend Flag Fest", startDate: "2027-02-27", endDate: "2027-03-02", venues: [venue("Field A", "Allen", { lat: 33.10, lon: -96.67 })], registrationUrl: "https://a.example.org/1" });
  // league whose overall range is in range via session
  await add({ externalId: "league", name: "Frisco Spring League", eventType: "league", startDate: "2027-03-20", endDate: "2027-05-20", registrationUrl: "https://b.example.org/2",
    sessions: [{ name: "Spring", startDate: "2027-03-20", endDate: "2027-05-20", gameDays: ["Sat"] }], venues: [venue("Frisco Commons", "Frisco", { lat: 33.15, lon: -96.82 })],
    divisions: [{ name: "Boys 8U", genderCategory: "boys", levelCategory: "youth", ageRuleType: "age_under", ageMax: 8, feeAmountMinor: 4500, feeCurrency: "USD", pricingBasis: "per_player" }] });
  // boys in Plano — should not appear for girls filter
  await add({ externalId: "boys-plano", name: "Plano Boys Flag Cup", startDate: "2027-03-14", endDate: "2027-03-14", registrationUrl: "https://c.example.org/3",
    venues: [venue("Oak Point", "Plano", { lat: 33.031, lon: -96.681 })],
    divisions: [{ name: "Boys 10–12", genderCategory: "boys", levelCategory: "youth", ageRuleType: "age_range", ageMin: 10, ageMax: 12 }] });
  // girls, unknown fee, no coordinates, Plano (unmappable)
  await add({ externalId: "nomap", name: "Plano Rec Girls Flag Night", startDate: "2027-03-20", endDate: "2027-03-20", registrationUrl: "https://d.example.org/4",
    venues: [venue("Rec Center (address not published)", "Plano", null)],
    divisions: [{ name: "Girls 12U", genderCategory: "girls", levelCategory: "youth", ageRuleType: "age_under", ageMax: 12, ageCutoffDate: "2026-08-31" }] });
  // Fort Worth: outside 25mi of Plano
  await add({ externalId: "fw", name: "Fort Worth Girls Flag Open", startDate: "2027-03-15", endDate: "2027-03-15", registrationUrl: "https://e.example.org/5", venues: [venue("FW Park", "Fort Worth", { lat: 32.75, lon: -97.33 })] });
  // past event
  await add({ externalId: "past", name: "Old Winter Flag", startDate: "2027-01-10", endDate: "2027-01-10", registrationUrl: "https://f.example.org/6", venues: [venue("Old", "Plano", plano)] });
  // synthetic
  const syn = await makeSource("syn", { synthetic: true });
  await ingestCandidate(db(), { source: syn, candidate: candidate({ externalId: "demo", url: "https://demo.invalid/1", name: "DEMO thing", registrationUrl: null, startDate: "2027-03-05", endDate: "2027-03-05", venues: [venue("Demo", "Plano", plano)] }), parserVersion: "1" });
});
afterAll(closePools);

const names = (r: Awaited<ReturnType<typeof q>>) => r.results.map((x) => x.name);

describe("search", () => {
  it("girls 10–12 near Plano, next 30 days", async () => {
    const r = await q("region=plano&gender=girls&ageMin=10&ageMax=12&chips=next30", false);
    // Allen is ~8 km from Plano's center, inside the default 25 km city radius.
    expect(names(r).sort()).toEqual(["Long Weekend Flag Fest", "Plano Girls Spring Flag", "Plano Rec Girls Flag Night"]);
    expect(names(r)).not.toContain("Plano Boys Flag Cup");
    expect(names(r)).not.toContain("Fort Worth Girls Flag Open");
    expect(r.results.every((x) => x.ageMatch === "definite")).toBe(true);
  });
  it("12U-with-cutoff division is only a 'possible' match for 12–13 year olds", async () => {
    const r2 = await q("region=plano&gender=girls&ageMin=12&ageMax=13&chips=next30", false);
    expect(r2.results.find((x) => x.name === "Plano Rec Girls Flag Night")?.ageMatch).toBe("possible");
  });
  it("default: upcoming, region DFW, soonest first; past events excluded", async () => {
    const r = await q("", false);
    expect(names(r)).not.toContain("Old Winter Flag");
    expect(names(r)[0]).toBe("Long Weekend Flag Fest");
  });
  it("multi-day event starting before the range and a league session in range are both included", async () => {
    const r = await q("from=2027-03-01&to=2027-03-31", false);
    expect(names(r)).toEqual(expect.arrayContaining(["Long Weekend Flag Fest", "Frisco Spring League"]));
  });
  it("counts unmappable results (map and list share one result set)", async () => {
    const r = await q("region=plano&gender=girls", false);
    expect(r.total).toBe(r.results.length);
    expect(r.mappable).toBe(r.results.filter((x) => x.venues.some((v) => v.lat !== null)).length);
    expect(r.total - r.mappable).toBe(1);
  });
  it("synthetic events are excluded unless demo display is on", async () => {
    expect(names(await q("", false))).not.toContain("DEMO thing");
    expect(names(await q("", true))).toContain("DEMO thing");
  });
  it("lowest price: unknown prices sort last", async () => {
    const r = await q("sort=price", false);
    const firstUnknown = r.results.findIndex((x) => x.minFee === null);
    expect(r.results.slice(firstUnknown).every((x) => x.minFee === null)).toBe(true);
    expect(r.results[0]!.minFee?.basis).toBe("per_player");
  });
  it("bbox search ('search this area')", async () => {
    const r = await q("bbox=-96.9,33.1,-96.7,33.2", false);
    expect(names(r)).toEqual(["Frisco Spring League"]);
  });
  it("radius from a point excludes far events", async () => {
    const r = await q(`lat=${plano.lat}&lon=${plano.lon}&radius=10&unit=mi`, false);
    expect(names(r)).not.toContain("Fort Worth Girls Flag Open");
    expect(r.results.every((x) => x.distanceLabel?.includes("straight-line"))).toBe(true);
  });
});

describe("SQL/TS eligibility parity", () => {
  it("ff_age_match agrees with matchAge on a grid", async () => {
    const rules: { type: AgeRuleType; min: number | null; max: number | null; cutoff: string | null; byMin?: number; byMax?: number }[] = [
      { type: "age_range", min: 10, max: 12, cutoff: null }, { type: "age_under", min: null, max: 12, cutoff: "2026-08-31" },
      { type: "age_under", min: null, max: 12, cutoff: "2027-12-31" }, { type: "unknown", min: null, max: null, cutoff: null },
      { type: "birth_year", min: null, max: null, cutoff: null, byMin: 2014, byMax: 2016 }, { type: "age_range", min: 13, max: null, cutoff: null },
    ];
    for (const rule of rules) for (let lo = 6; lo <= 15; lo++) for (const hi of [lo, lo + 2]) {
      const ts = matchAge({ type: rule.type, min: rule.min, max: rule.max, cutoffDate: rule.cutoff, birthYearMin: rule.byMin ?? null, birthYearMax: rule.byMax ?? null, original: null }, { min: lo, max: hi }, "2027-03-13");
      const sql = (await db().query(`SELECT ff_age_match($1::age_rule_type,$2,$3,$4,$5,$6::date,$7,$8,'2027-03-13') AS m`, [rule.type, rule.min, rule.max, rule.byMin ?? null, rule.byMax ?? null, rule.cutoff, lo, hi])).rows[0].m;
      expect(sql, `${JSON.stringify(rule)} ${lo}-${hi}`).toBe(ts);
    }
  });
});
