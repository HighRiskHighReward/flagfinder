import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ingestCandidate, markEventCheckFailed, markRecordMissing } from "../src/ingest";
import { assertSeedAllowed } from "../src/seed";
import { closePools } from "../src/client";
import { candidate, db, makeSource, truncateAll } from "./helpers";

beforeEach(truncateAll);
afterAll(closePools);

const ev = async (id: string) => (await db().query(`SELECT * FROM events WHERE id=$1`, [id])).rows[0];

describe("Invariant 6: published real events link to a source", () => {
  it("rejects publishing a real event with no source record", async () => {
    await expect(db().query(`INSERT INTO events (slug, name, timezone, sport_scope, publish_state) VALUES ('x','X','America/Chicago','flag','published')`))
      .rejects.toThrow(/Invariant 6/);
  });
  it("allows it when a source record with URL exists in the same transaction", async () => {
    const src = await makeSource("s1");
    const o = await ingestCandidate(db(), { source: src, candidate: candidate(), parserVersion: "1" });
    expect(o).toMatchObject({ kind: "created", published: true });
    const links = await db().query(`SELECT url FROM source_records WHERE event_id=$1`, [(o as { eventId: string }).eventId]);
    expect(links.rows[0].url).toMatch(/^https:\/\//);
  });
  it("cannot delete the only supporting source record of a published event", async () => {
    const src = await makeSource("s1");
    const o = await ingestCandidate(db(), { source: src, candidate: candidate(), parserVersion: "1" });
    await db().query(`DELETE FROM field_provenance`);
    await expect(db().query(`DELETE FROM source_records WHERE event_id=$1`, [(o as { eventId: string }).eventId])).rejects.toThrow(/Invariant 6/);
  });
});

describe("Invariant 2: synthetic quarantine", () => {
  it("seed throws in production", () => {
    expect(() => assertSeedAllowed("production")).toThrow(/production/);
    expect(() => assertSeedAllowed("development", "production")).toThrow(/production/);
    expect(() => assertSeedAllowed("development", undefined)).not.toThrow();
  });
  it("a synthetic source record cannot attach to a real event", async () => {
    const real = await makeSource("real");
    const o = await ingestCandidate(db(), { source: real, candidate: candidate(), parserVersion: "1" });
    const syn = await makeSource("syn", { synthetic: true });
    await expect(db().query(`INSERT INTO source_records (source_id, external_key, url, parser_version, content_hash, normalized, is_synthetic, event_id) VALUES ($1,'k','https://x.invalid','1','h','{}',true,$2)`, [syn.id, (o as { eventId: string }).eventId]))
      .rejects.toThrow(/synthetic\/real mismatch/);
  });
});

describe("change tracking", () => {
  it("re-ingesting a changed source updates the same event, logs a material venue change", async () => {
    const src = await makeSource("s1");
    const a = await ingestCandidate(db(), { source: src, candidate: candidate(), parserVersion: "1", fetchedAt: new Date("2026-11-01T00:00:00Z") });
    const id = (a as { eventId: string }).eventId;
    const moved = candidate({ venues: [{ name: "Russell Creek Park", locality: "Plano", adminArea: "TX", countryCode: "US", lat: 33.05, lon: -96.75, geoPrecision: "street", geocodeProvider: "source_published", geocodeLicense: "source_published" }] });
    const b = await ingestCandidate(db(), { source: src, candidate: moved, parserVersion: "1", fetchedAt: new Date("2026-11-02T00:00:00Z") });
    expect(b).toMatchObject({ kind: "updated", eventId: id, material: true });
    expect((await db().query(`SELECT count(*)::int n FROM events`)).rows[0].n).toBe(1);
    const changes = (await db().query(`SELECT field, material FROM event_changes WHERE event_id=$1`, [id])).rows;
    expect(changes).toContainEqual({ field: "venues", material: true });
    const e = await ev(id);
    expect(e.last_material_change_at.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });
  it("unchanged re-ingest advances success but not material change", async () => {
    const src = await makeSource("s1");
    const a = await ingestCandidate(db(), { source: src, candidate: candidate(), parserVersion: "1", fetchedAt: new Date("2026-11-01T00:00:00Z") });
    const id = (a as { eventId: string }).eventId;
    const b = await ingestCandidate(db(), { source: src, candidate: candidate(), parserVersion: "1", fetchedAt: new Date("2026-11-05T00:00:00Z") });
    expect(b.kind).toBe("unchanged");
    const e = await ev(id);
    expect(e.last_success_at.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(e.last_material_change_at.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("explicit cancellation sets cancelled with evidence", async () => {
    const src = await makeSource("s1");
    const a = await ingestCandidate(db(), { source: src, candidate: candidate(), parserVersion: "1" });
    await ingestCandidate(db(), { source: src, candidate: candidate({ statusSignal: { schemaEventStatus: null, text: "This tournament has been cancelled due to weather." } }), parserVersion: "1" });
    const e = await ev((a as { eventId: string }).eventId);
    expect(e.status).toBe("cancelled");
    expect(e.status_evidence).toMatch(/cancelled/);
  });
  it("a 404 sets source_missing only, never cancelled; freshness untouched", async () => {
    const src = await makeSource("s1");
    const a = await ingestCandidate(db(), { source: src, candidate: candidate(), parserVersion: "1", fetchedAt: new Date("2026-11-01T00:00:00Z") });
    const id = (a as { eventId: string }).eventId;
    await markRecordMissing(db(), src.id, "ext-1", 404, new Date("2026-11-03T00:00:00Z"));
    const e = await ev(id);
    expect(e.status).toBe("source_missing");
    expect(e.last_success_at.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(e.last_checked_at.toISOString()).toBe("2026-11-03T00:00:00.000Z");
    const r = await db().query(`SELECT kind FROM review_items WHERE event_id=$1`, [id]);
    expect(r.rows.map((x) => x.kind)).toContain("source_missing");
  });
  it("a failed fetch leaves last_success_at and last_material_change_at unchanged", async () => {
    const src = await makeSource("s1");
    const a = await ingestCandidate(db(), { source: src, candidate: candidate(), parserVersion: "1", fetchedAt: new Date("2026-11-01T00:00:00Z") });
    const id = (a as { eventId: string }).eventId;
    await markEventCheckFailed(db(), id, new Date("2026-11-04T00:00:00Z"));
    const e = await ev(id);
    expect(e.last_success_at.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(e.last_material_change_at.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("dedup across sources", () => {
  it("same event from two sources merges and keeps both provenance records", async () => {
    const s1 = await makeSource("s1");
    const s2 = await makeSource("s2", { access: "json_ld" });
    const a = await ingestCandidate(db(), { source: s1, candidate: candidate(), parserVersion: "1" });
    const b = await ingestCandidate(db(), { source: s2, candidate: candidate({ externalId: "other-99", url: "https://league.example.net/e/99", name: "Spring Girls Flag Football Tournament 2027" }), parserVersion: "1" });
    expect(b).toMatchObject({ kind: "attached", eventId: (a as { eventId: string }).eventId });
    const prov = await db().query(`SELECT DISTINCT source_record_id FROM field_provenance WHERE event_id=$1`, [(a as { eventId: string }).eventId]);
    expect(prov.rowCount).toBe(2);
    expect((await ev((a as { eventId: string }).eventId)).verification_level).toBe("multi_source_corroborated");
  });
  it("2025 and 2026 editions of a series stay separate", async () => {
    const s1 = await makeSource("s1");
    await ingestCandidate(db(), { source: s1, candidate: candidate({ externalId: "e25", series: { name: "Spring Classic", editionLabel: "2025" }, startDate: "2025-03-15", endDate: "2025-03-16" }), parserVersion: "1" });
    await ingestCandidate(db(), { source: s1, candidate: candidate({ externalId: "e26", series: { name: "Spring Classic", editionLabel: "2026" }, startDate: "2026-03-14", endDate: "2026-03-15" }), parserVersion: "1" });
    const r = await db().query(`SELECT count(DISTINCT edition_id)::int n, count(*)::int e FROM events`);
    expect(r.rows[0]).toEqual({ n: 2, e: 2 });
  });
  it("two weekends of one series stay separate", async () => {
    const s1 = await makeSource("s1");
    await ingestCandidate(db(), { source: s1, candidate: candidate({ externalId: "w1", series: { name: "Fall Series", editionLabel: "Weekend 1" }, startDate: "2027-03-13", endDate: "2027-03-14" }), parserVersion: "1" });
    const b = await ingestCandidate(db(), { source: s1, candidate: candidate({ externalId: "w2", series: { name: "Fall Series", editionLabel: "Weekend 2" }, startDate: "2027-03-20", endDate: "2027-03-21" }), parserVersion: "1" });
    expect(b.kind).toBe("created");
  });
});

describe("flag-only scope", () => {
  it("rejects tackle events", async () => {
    const s1 = await makeSource("s1");
    const o = await ingestCandidate(db(), { source: s1, candidate: candidate({ sportScope: "unknown", name: "Youth Tackle Football Camp", description: "full pads" }), parserVersion: "1" });
    expect(o).toMatchObject({ kind: "rejected", reason: "out_of_scope:tackle" });
  });
  it("publishes only flag divisions of mixed events", async () => {
    const s1 = await makeSource("s1");
    const o = await ingestCandidate(db(), { source: s1, candidate: candidate({ sportScope: "mixed", divisions: [
      { name: "Flag 8U", sportScope: "flag", ageRuleType: "age_under", ageMax: 8 }, { name: "Tackle 12U", sportScope: "tackle", ageRuleType: "age_under", ageMax: 12 },
    ] }), parserVersion: "1" });
    const d = await db().query(`SELECT name FROM divisions WHERE event_id=$1`, [(o as { eventId: string }).eventId]);
    expect(d.rows.map((x) => x.name)).toEqual(["Flag 8U"]);
  });
});

describe("unknowns stay unknown", () => {
  it("missing fee is stored as unknown, never 0", async () => {
    const s1 = await makeSource("s1");
    const o = await ingestCandidate(db(), { source: s1, candidate: candidate({ divisions: [{ name: "Open", ageRuleType: "unknown" }] }), parserVersion: "1" });
    const d = (await db().query(`SELECT fee_status, fee_amount_minor, capacity_status FROM divisions WHERE event_id=$1`, [(o as { eventId: string }).eventId])).rows[0];
    expect(d).toEqual({ fee_status: "unknown", fee_amount_minor: null, capacity_status: "unknown" });
  });
  it("DB refuses a fee amount marked unknown", async () => {
    const s1 = await makeSource("s1");
    const o = await ingestCandidate(db(), { source: s1, candidate: candidate(), parserVersion: "1" });
    await expect(db().query(`UPDATE divisions SET fee_status='unknown' WHERE event_id=$1`, [(o as { eventId: string }).eventId])).rejects.toThrow(/divisions_fee_known/);
  });
  it("ambiguous extraction goes to review, not published", async () => {
    const s1 = await makeSource("s1");
    const o = await ingestCandidate(db(), { source: s1, candidate: candidate({ ambiguities: [{ field: "startDate", reason: "numeric_without_year", evidence: "3/4" }] }), parserVersion: "1" });
    expect(o).toMatchObject({ kind: "created", published: false });
  });
});

describe("venues", () => {
  it("same venue name in different cities stays separate", async () => {
    const s1 = await makeSource("s1");
    const mk = (id: string, city: string, lat: number) => candidate({ externalId: id, startDate: id === "a" ? "2027-03-13" : "2027-04-13", endDate: null, registrationUrl: null,
      venues: [{ name: "Central Park", locality: city, adminArea: "TX", countryCode: "US", lat, lon: -96.7, geoPrecision: "street", geocodeProvider: "source_published", geocodeLicense: "source_published" }] });
    await ingestCandidate(db(), { source: s1, candidate: mk("a", "Plano", 33.0), parserVersion: "1" });
    await ingestCandidate(db(), { source: s1, candidate: mk("b", "Denton", 33.2), parserVersion: "1" });
    expect((await db().query(`SELECT count(*)::int n FROM venues`)).rows[0].n).toBe(2);
  });
});

describe("admin merge/unmerge and publish", () => {
  it("merge keeps all source records and provenance; unmerge restores both events", async () => {
    const { mergeEvents, unmergeEvents } = await import("../src/admin");
    const s1 = await makeSource("s1");
    const s2 = await makeSource("s2");
    const a = await ingestCandidate(db(), { source: s1, candidate: candidate(), parserVersion: "1" }) as { eventId: string };
    const b = await ingestCandidate(db(), { source: s2, candidate: candidate({ externalId: "z", url: "https://other.example.org/z", name: "Totally Different Name", startDate: "2027-05-01", endDate: null, registrationUrl: null }), parserVersion: "1" }) as { eventId: string };
    const mid = await mergeEvents(db(), a.eventId, b.eventId, "admin@test");
    expect((await db().query(`SELECT count(*)::int n FROM source_records WHERE event_id=$1`, [a.eventId])).rows[0].n).toBe(2);
    expect((await ev(b.eventId)).publish_state).toBe("merged");
    await unmergeEvents(db(), mid, "admin@test");
    expect((await ev(b.eventId)).publish_state).toBe("published");
    expect((await db().query(`SELECT count(*)::int n FROM source_records WHERE event_id=$1`, [b.eventId])).rows[0].n).toBe(1);
    expect((await db().query(`SELECT action FROM audit_log ORDER BY id`)).rows.map((r) => r.action)).toEqual(["merge_events", "unmerge_events"]);
  });
  it("audit log is append-only", async () => {
    const { audit } = await import("../src/admin");
    await audit(db(), "a", "x", null, null);
    await expect(db().query(`UPDATE audit_log SET actor='b'`)).rejects.toThrow(/append-only/);
    await expect(db().query(`DELETE FROM audit_log`)).rejects.toThrow(/append-only/);
  });
});
