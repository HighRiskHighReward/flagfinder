import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { candidateSchema } from "@ff/core";
import { extractIflagItems, iflagConnector, iflagDivision, parseIflagDate } from "../src";

// REAL recorded excerpts (2026-11-08) — see fixtures/recorded/iflag/*.meta.json.
const fx = (p: string) => readFileSync(fileURLToPath(new URL(`../fixtures/recorded/iflag/${p}`, import.meta.url)), "utf8");
const cfg = { pageUrls: ["https://iflag.org/sanctioned-tournaments/", "https://iflag.org/tournaments/"], timezone: "America/Chicago", countryCode: "US" };
const NOW = new Date("2026-11-08T12:00:00Z");
const ok = (body: string, url: string) => ({ kind: "ok" as const, url, status: 200, contentType: "text/html", body, etag: null, lastModified: null, fetchedAt: NOW });
const run = async (file: string, url: string, now = NOW) => {
  const parsed = await iflagConnector.parse(ok(fx(file), url), { config: cfg, now });
  return { parsed, cands: await iflagConnector.normalize(parsed, { config: cfg, now }) };
};

describe("iFlag connector (recorded real pages)", () => {
  it("extracts each listing once despite responsive duplicates", () => {
    const items = extractIflagItems(fx("sanctioned-tournaments-2026-11-08.html"));
    expect(items).toHaveLength(5);
    expect(new Set(items.map((i) => i.postId)).size).toBe(5);
  });
  it("normalizes a DFW sanctioned tournament with dates, city and divisions, and every candidate validates", async () => {
    const { cands } = await run("sanctioned-tournaments-2026-11-08.html", "https://iflag.org/sanctioned-tournaments/");
    expect(cands).toHaveLength(5);
    for (const c of cands) expect(candidateSchema.safeParse(c).success).toBe(true);
    const fw = cands.find((c) => c.name.startsWith("Lonestar Shootout"))!;
    expect(fw).toMatchObject({ startDate: "2026-12-18", endDate: "2026-12-20", eventType: "tournament", sportScope: "flag", datePrecision: "day" });
    expect(fw.venues![0]).toMatchObject({ locality: "Fort Worth", adminArea: "TX", lat: null, geoPrecision: "unknown" });
    expect(fw.divisions!.map((d) => d.name)).toEqual(["Youth 6U - 18U", "High School Girls 7v7"]);
    // Organizer link is on ZortsSports, whose terms forbid deep links → not republished, flagged for review.
    expect(fw.registrationUrl ?? null).toBeNull();
    expect(fw.ambiguities![0]).toMatchObject({ field: "registrationUrl", evidence: "zortssports.com" });
    expect(fw.url).toBe("https://iflag.org/sanctioned-tournaments/");
  });
  it("iFlag-hosted events use their own detail page as the source URL", async () => {
    const { cands } = await run("tournaments-2026-11-08.html", "https://iflag.org/tournaments/");
    const atx = cands.find((c) => c.name === "ATX Bowl")!;
    expect(atx).toMatchObject({ url: "https://iflag.org/tournaments/2026-atx-bowl/", startDate: "2026-11-21", endDate: "2026-11-22", description: "iFlag status: Regional Qualifier." });
    expect(atx.venues![0]!.locality).toBe("Arlington");
    expect(atx.organizer).toMatchObject({ name: "iFlag" });
  });
  it("drops past events and is deterministic", async () => {
    const later = new Date("2026-12-19T12:00:00Z");
    const { cands } = await run("sanctioned-tournaments-2026-11-08.html", "https://iflag.org/sanctioned-tournaments/", later);
    expect(cands.map((c) => c.name)).toEqual(["Lonestar Shootout Powered by Military Bowl Week"]);
    expect((await run("tournaments-2026-11-08.html", "https://iflag.org/tournaments/")).cands).toEqual((await run("tournaments-2026-11-08.html", "https://iflag.org/tournaments/")).cands);
  });
  it("never guesses dates or ages", () => {
    expect(parseIflagDate("Sat, Nov 14, 2026")).toBe("2026-11-14");
    expect(parseIflagDate("TBD")).toBeNull();
    expect(iflagDivision("Youth 6U - 18U")).toMatchObject({ levelCategory: "youth", ageRuleType: "unknown", ageMin: null, ageMax: null });
    expect(iflagDivision("Over 35")).toMatchObject({ levelCategory: "adult", ageMin: 35 });
    expect(iflagDivision("High School Girls 7v7")).toMatchObject({ genderCategory: "girls", levelCategory: "high_school", format: "7v7" });
  });
});
