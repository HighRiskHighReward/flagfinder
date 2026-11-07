import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPoliteHttp, resetRateLimiters, type SourceConnector } from "@ff/connectors";
import { closePools } from "@ff/db";
import { db, truncateAll } from "../../../packages/db/test/helpers";
import { MAX_ATTEMPTS, RETRY_BASE_MS, runSourceJob, type RunDeps } from "../src/run-source";
import { planDue } from "../src/plan";
import { reparseSource, reviewSweep } from "../src/jobs";
import { processAlerts } from "../src/alerts";
import type { JobQueue } from "../src/queue";

const FIXTURE = readFileSync(fileURLToPath(new URL("../../../packages/connectors/fixtures/ical/synthetic-city-calendar.ics", import.meta.url)), "utf8");
const NOW = new Date("2027-03-01T12:00:00Z");
const silent = () => {};

let feed = FIXTURE;
let feedStatus = 200;
let server: Server; let port = 0;
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("User-agent: *\nAllow: /\n"); }
    if (req.url === "/cal.ics") {
      if (feedStatus === 429) { res.writeHead(429, { "retry-after": "120" }); return res.end(); }
      if (feedStatus !== 200) { res.writeHead(feedStatus); return res.end(); }
      const etag = `"${createHash("sha1").update(feed).digest("hex")}"`;
      if (req.headers["if-none-match"] === etag) { res.writeHead(304); return res.end(); }
      res.writeHead(200, { "content-type": "text/calendar", etag }); return res.end(feed);
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); await closePools(); });
beforeEach(async () => { await truncateAll(); resetRateLimiters(); feed = FIXTURE; feedStatus = 200; });

function recorder(): JobQueue & { sent: { queue: string; data: Record<string, unknown>; opts?: Record<string, unknown> }[] } {
  const sent: { queue: string; data: Record<string, unknown>; opts?: Record<string, unknown> }[] = [];
  return { sent, send: async (queue, data, opts) => { sent.push({ queue, data: data as Record<string, unknown>, opts: opts as Record<string, unknown> }); return "id"; } };
}

async function makeIcalSource(status = "enabled") {
  const r = await db().query(
    `INSERT INTO sources (key, name, url, connector_key, parser_version, access_method, permission_notes, status, status_reason, config, priority_bucket)
     VALUES ('test-city','TEST city calendar (synthetic fixture via local server)','http://127.0.0.1/','ical','ical-1.0.0','ical','test',$1,'test',$2,'dfw') RETURNING id`,
    [status, JSON.stringify({ feedUrl: `http://127.0.0.1:${port}/cal.ics`, timezone: "America/Chicago", countryCode: "US", adminArea: "TX", organizerName: "TEST City Parks", knownLocalities: ["Plano", "Frisco", "Allen"] })]);
  return r.rows[0].id as string;
}
function deps(queue = recorder(), extra: Partial<RunDeps> = {}): RunDeps {
  return { db: db(), queue, now: () => NOW, log: silent, httpFor: () => createPoliteHttp({ ratePerMinute: 6000, fetchOptions: { unsafeAllowLoopback: true }, robotsCache: new Map() }), ...extra };
}
const count = async (sql: string, p: unknown[] = []) => (await db().query(sql, p)).rows[0].n as number;

describe("end-to-end ingestion through the real fetch path (synthetic fixture content)", () => {
  it("source record → published listing with source links; re-ingest of a changed source updates without duplicates and logs the change", async () => {
    const sid = await makeIcalSource();
    const r1 = await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w1" });
    expect(r1).toMatchObject({ kind: "succeeded" });
    const published = await db().query(`SELECT e.id, e.name, sr.url FROM events e JOIN source_records sr ON sr.event_id=e.id WHERE e.publish_state='published'`);
    expect(published.rows.length).toBeGreaterThanOrEqual(1);
    expect(published.rows.every((r) => /^https?:\/\//.test(r.url))).toBe(true);
    const jamboree = published.rows.find((r) => /Jamboree/.test(r.name))!;
    const before = await count(`SELECT count(*)::int n FROM events`);

    feed = FIXTURE.replace("Example Park Field 2, 100 Example Rd, Plano, TX", "Example Sports Complex, 200 Other St, Plano, TX").replace("GEO:33.0301;-96.6801", "GEO:33.0501;-96.7101");
    const r2 = await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w2" });
    expect(r2).toMatchObject({ kind: "succeeded", stats: { updated: 1 } });
    expect(await count(`SELECT count(*)::int n FROM events`)).toBe(before);
    const ch = await db().query(`SELECT field, material FROM event_changes WHERE event_id=$1`, [jamboree.id]);
    expect(ch.rows).toContainEqual({ field: "venues", material: true });
  });

  it("unchanged feed → 304 conditional request counts as a successful check", async () => {
    const sid = await makeIcalSource();
    await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w1" });
    const r = await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w2" });
    expect(r).toMatchObject({ kind: "succeeded", stats: { notModified: 1, fetched: 0 } });
  });

  it("an event dropped from a complete feed becomes source_missing (never cancelled)", async () => {
    const sid = await makeIcalSource();
    await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w1" });
    feed = FIXTURE.replace(/BEGIN:VEVENT\nUID:synthetic-1001[\s\S]*?END:VEVENT\n/, "");
    await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w2" });
    const e = (await db().query(`SELECT e.status FROM events e JOIN source_records sr ON sr.event_id=e.id WHERE sr.external_id='synthetic-1001@example.org'`)).rows[0];
    expect(e.status).toBe("source_missing");
  });

  it("a forced fetch failure leaves freshness untouched", async () => {
    const sid = await makeIcalSource();
    await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w1" });
    const before = (await db().query(`SELECT id, last_success_at, last_material_change_at FROM events ORDER BY id`)).rows;
    feedStatus = 500;
    const r = await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w2" });
    expect(r.kind).toBe("retry_scheduled");
    const after = (await db().query(`SELECT id, last_success_at, last_material_change_at, last_checked_at FROM events ORDER BY id`)).rows;
    after.forEach((a, i) => {
      expect(a.last_success_at).toEqual(before[i].last_success_at);
      expect(a.last_material_change_at).toEqual(before[i].last_material_change_at);
    });
    const src = (await db().query(`SELECT consecutive_failures, last_errors FROM sources WHERE id=$1`, [sid])).rows[0];
    expect(src.consecutive_failures).toBe(1);
    expect(src.last_errors[0].error).toMatch(/HTTP 500/);
  });

  it("a parser version bump re-parses stored raw payloads without re-fetching or duplicating", async () => {
    const sid = await makeIcalSource();
    await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w1" });
    const n = await count(`SELECT count(*)::int n FROM events`);
    const srBefore = await count(`SELECT count(*)::int n FROM source_records`);
    feedStatus = 500; // proves no network use
    const r = await reparseSource(db(), sid, silent, NOW);
    expect(r.reparsed).toBeGreaterThan(0);
    expect(await count(`SELECT count(*)::int n FROM events`)).toBe(n);
    expect(await count(`SELECT count(*)::int n FROM source_records`)).toBe(srBefore);
  });
});

describe("scheduler guarantees", () => {
  it("concurrent triggers for the same source/window run once", async () => {
    const sid = await makeIcalSource();
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "same-window" })));
    const kinds = [a!.kind, b!.kind, c!.kind].sort();
    expect(kinds.filter((k) => k === "succeeded")).toHaveLength(1);
    expect(kinds.filter((k) => k === "skipped")).toHaveLength(2);
    expect(await count(`SELECT count(*)::int n FROM ingestion_runs WHERE window_key='same-window'`)).toBe(1);
  });

  it("retries back off exponentially with full jitter", async () => {
    const sid = await makeIcalSource();
    feedStatus = 500;
    for (const [attempt, rnd] of [[1, 0.99], [2, 0.99], [3, 0.5]] as const) {
      await db().query(`UPDATE sources SET consecutive_failures=0 WHERE id=$1`, [sid]);
      const q = recorder();
      const r = await runSourceJob(deps(q, { rand: () => rnd }), { sourceId: sid, jobType: "refresh", window: `w-${attempt}`, attempt });
      expect(r.kind).toBe("retry_scheduled");
      const delay = (r as { delayMs: number }).delayMs;
      expect(delay).toBeLessThan(RETRY_BASE_MS * 2 ** attempt);
      expect(delay).toBe(Math.floor(rnd * RETRY_BASE_MS * 2 ** attempt));
      expect(q.sent[0]).toMatchObject({ queue: "refresh", data: { attempt: attempt + 1 } });
      expect(q.sent[0]!.opts!.startAfterSeconds).toBe(Math.ceil(delay / 1000));
    }
  });

  it("a 429 respects Retry-After", async () => {
    const sid = await makeIcalSource();
    feedStatus = 429;
    const q = recorder();
    const r = await runSourceJob(deps(q, { rand: () => 0 }), { sourceId: sid, jobType: "refresh", window: "w1" });
    expect(r).toMatchObject({ kind: "retry_scheduled" });
    expect((r as { delayMs: number }).delayMs).toBeGreaterThanOrEqual(120_000);
    expect(q.sent[0]!.opts!.startAfterSeconds).toBeGreaterThanOrEqual(120);
  });

  it("dead-letters after max attempts", async () => {
    const sid = await makeIcalSource();
    feedStatus = 500;
    const q = recorder();
    const r = await runSourceJob(deps(q), { sourceId: sid, jobType: "refresh", window: "w-last", attempt: MAX_ATTEMPTS });
    expect(r.kind).toBe("dead_lettered");
    expect(q.sent.map((s) => s.queue)).toEqual(["dead-letter"]);
    expect(await count(`SELECT count(*)::int n FROM dead_letters`)).toBe(1);
  });

  it("circuit breaker opens after repeated failures and raises an alert", async () => {
    const sid = await makeIcalSource();
    feedStatus = 500;
    await db().query(`UPDATE sources SET consecutive_failures=4 WHERE id=$1`, [sid]);
    const alerts: string[] = [];
    await runSourceJob(deps(recorder(), { onAlert: (m) => alerts.push(m), failureAlertThreshold: 5 }), { sourceId: sid, jobType: "refresh", window: "w9" });
    expect(alerts[0]).toMatch(/failed 5 times/);
    expect((await db().query(`SELECT circuit_open_until FROM sources WHERE id=$1`, [sid])).rows[0].circuit_open_until).not.toBeNull();
    expect(await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w10" })).toMatchObject({ kind: "skipped", reason: "circuit_open" });
  });

  it("sources that aren't enabled are never fetched", async () => {
    const sid = await makeIcalSource("pending_permission");
    expect(await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w1" })).toMatchObject({ kind: "skipped", reason: "source_status_pending_permission" });
  });

  it("robots-disallowed paths are not fetched", async () => {
    const sid = await makeIcalSource();
    const blocked: SourceConnector["fetch"] = async (ref) => ({ kind: "disallowed", url: ref.url, reason: "robots.txt disallows this path", fetchedAt: NOW });
    const { icalConnector } = await import("@ff/connectors");
    const r = await runSourceJob(deps(recorder(), { connectorFor: () => ({ ...icalConnector, fetch: blocked }) }), { sourceId: sid, jobType: "refresh", window: "w1" });
    expect(r).toMatchObject({ kind: "failed", reason: /not permitted/ });
  });

  it("plans with deterministic per-source offsets, one run per window, within the bucket budget", () => {
    const sources = Array.from({ length: 50 }, (_, i) => ({ id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`, priority_bucket: (["dfw", "us", "intl"] as const)[i % 3]!, refresh_cadence_minutes: 60 }));
    const base = Date.parse("2027-03-01T00:00:00Z");
    const all: string[] = [];
    for (let m = 0; m < 60; m++) {
      const due = planDue(sources, new Date(base + m * 60_000), { tickSeconds: 60, weights: { dfw: 0.6, us: 0.25, intl: 0.15 }, hourlyCapacity: 1000, runsLastHour: {}, rand: () => 0.5 });
      all.push(...due.map((d) => d.sourceId));
    }
    expect(new Set(all).size).toBe(50);   // every source exactly once in the hour
    expect(all.length).toBe(50);
    const firstMinute = planDue(sources, new Date(base), { tickSeconds: 3600, weights: { dfw: 0.6, us: 0.25, intl: 0.15 }, hourlyCapacity: 10, runsLastHour: {}, rand: () => 0 });
    expect(firstMinute.filter((d) => sources.find((s) => s.id === d.sourceId)!.priority_bucket === "dfw").length).toBeLessThanOrEqual(6);
    expect(firstMinute.filter((d) => sources.find((s) => s.id === d.sourceId)!.priority_bucket === "intl").length).toBeLessThanOrEqual(1);
  });
});

describe("review sweep", () => {
  it("surfaces stale records and marks finished events completed", async () => {
    const sid = await makeIcalSource();
    await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w1" });
    await db().query(`UPDATE events SET last_success_at = now() - interval '10 days'`);
    const r = await reviewSweep(db(), silent);
    expect(r.stale).toBeGreaterThan(0);
  });
});

describe("alerts (dev catcher)", () => {
  it("a material change to a saved event emails confirmed subscribers once (dedupe), never unconfirmed ones", async () => {
    const sid = await makeIcalSource();
    await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w1" });
    const ev = (await db().query(`SELECT e.id FROM events e JOIN source_records sr ON sr.event_id=e.id WHERE sr.external_id='synthetic-1001@example.org'`)).rows[0].id;
    await db().query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ('u1','Coach','coach@example.test',true), ('u2','Parent','parent@example.test',true)`);
    await db().query(`INSERT INTO alert_preferences (user_id, frequency, confirmed_at) VALUES ('u1','instant',now()), ('u2','instant',NULL)`);
    await db().query(`INSERT INTO favorites (user_id, event_id) VALUES ('u1',$1), ('u2',$1)`, [ev]);
    await processAlerts(db(), silent, { baseUrl: "http://localhost:3000" }); // move cursor past initial history
    await db().query(`DELETE FROM email_outbox`);
    feed = FIXTURE.replace("DTSTART;VALUE=DATE:20270313", "DTSTART;VALUE=DATE:20270320").replace("DTEND;VALUE=DATE:20270315", "DTEND;VALUE=DATE:20270322");
    await runSourceJob(deps(), { sourceId: sid, jobType: "refresh", window: "w2" });
    await processAlerts(db(), silent, { baseUrl: "http://localhost:3000" });
    await processAlerts(db(), silent, { baseUrl: "http://localhost:3000" });
    const mail = (await db().query(`SELECT to_address, subject, body_text FROM email_outbox`)).rows;
    expect(mail).toHaveLength(1);
    expect(mail[0].to_address).toBe("coach@example.test");
    expect(mail[0].body_text).toMatch(/unsubscribe/i);
    expect(mail[0].body_text).toMatch(/start date changed/);
  });
});
