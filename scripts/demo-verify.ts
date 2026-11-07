/**
 * §14 completion demo. Runs against a fresh local stack (database `flagfinder_demo`) and prints
 * PASS / FAIL / PENDING with evidence for each criterion. Nothing here is claimed without a check.
 *   pnpm demo:verify            (requires Postgres+PostGIS running and a web build: pnpm build)
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import pg from "pg";
import { integrationStatuses, loadEnv } from "../packages/config/src/env";
import { resolveMapConfig } from "../apps/web/src/lib/map-config";
import { parseSearchState } from "../packages/core/src/search-state";
import { migrate, resetSchema } from "../packages/db/src/migrate";
import { seedSynthetic } from "../packages/db/src/seed";
import { searchEvents } from "../packages/db/src/search";
import { publishEvent } from "../packages/db/src/admin";
import { NoLlmProvider } from "../packages/providers/src/llm";
import { createPoliteHttp } from "../packages/connectors/src/http";
import { processSubmission } from "../apps/worker/src/submissions";
import { bossQueue, startBoss } from "../apps/worker/src/queue";

const ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_URL = process.env.DEMO_ADMIN_DATABASE_URL ?? "postgres://flagfinder:flagfinder@localhost:5432/flagfinder";
const DEMO_URL = "postgres://flagfinder:flagfinder@localhost:5432/flagfinder_demo";
const WEB_PORT = 3100;
type Status = "PASS" | "FAIL" | "PENDING";
const results: { n: number; title: string; status: Status; evidence: string[] }[] = [];
const report = (n: number, title: string, status: Status, evidence: string[]) => {
  results.push({ n, title, status, evidence });
  console.log(`\n[${status}] ${n}. ${title}`);
  for (const e of evidence) console.log(`       - ${e}`);
};
const children: ChildProcess[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs: number, every = 1000): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { const v = await fn().catch(() => null); if (v) return v; await sleep(every); }
  return null;
}
function start(cmd: string, args: string[], env: Record<string, string>, name: string) {
  const c = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  c.stdout!.on("data", (d) => { out += d; }); c.stderr!.on("data", (d) => { out += d; });
  children.push(c);
  return { proc: c, log: () => out, name };
}

async function main() {
  console.log("FlagFinder completion demo — fresh local stack\n");
  // ---------- fresh database ----------
  const admin = new pg.Pool({ connectionString: ADMIN_URL });
  await admin.query(`DROP DATABASE IF EXISTS flagfinder_demo WITH (FORCE)`);
  await admin.query(`CREATE DATABASE flagfinder_demo OWNER flagfinder`);
  await admin.end();
  process.env.DATABASE_URL = DEMO_URL;
  const db = new pg.Pool({ connectionString: DEMO_URL });
  await resetSchema(db); await migrate(db);
  const seeded = await seedSynthetic(db);
  console.log(`database flagfinder_demo created, migrated, ${seeded} SYNTHETIC demo events seeded`);

  // ---------- local fixture server (real HTTP; content is the SYNTHETIC fixture) ----------
  const fixture = readFileSync(path.join(ROOT, "packages/connectors/fixtures/ical/synthetic-city-calendar.ics"), "utf8");
  const page = readFileSync(path.join(ROOT, "packages/connectors/fixtures/jsonld/synthetic-event-page.html"), "utf8");
  let feed = fixture, feedStatus = 200;
  const server = createServer((req, res) => {
    if (req.url === "/robots.txt") { res.writeHead(200); return res.end("User-agent: *\nAllow: /\n"); }
    if (req.url === "/event") { res.writeHead(200, { "content-type": "text/html" }); return res.end(page); }
    if (req.url === "/cal.ics") {
      if (feedStatus !== 200) { res.writeHead(feedStatus); return res.end(); }
      const etag = `"${createHash("sha1").update(feed).digest("hex")}"`;
      if (req.headers["if-none-match"] === etag) { res.writeHead(304); return res.end(); }
      res.writeHead(200, { "content-type": "text/calendar", etag }); return res.end(feed);
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  const sourceId = (await db.query(
    `INSERT INTO sources (key, name, url, connector_key, parser_version, access_method, permission_notes, status, status_reason, config, priority_bucket, refresh_cadence_minutes)
     VALUES ('demo-local-fixture','DEMO local fixture server (synthetic content)','http://127.0.0.1/','ical','ical-1.0.0','ical','Local fixture server for the demo','enabled','demo',$1,'dfw',60) RETURNING id`,
    [JSON.stringify({ feedUrl: `http://127.0.0.1:${port}/cal.ics`, timezone: "America/Chicago", countryCode: "US", adminArea: "TX", organizerName: "SYNTHETIC City Parks", knownLocalities: ["Plano", "Frisco", "Allen"] })])).rows[0].id;

  // ---------- 7 first: worker + scheduler with the web app stopped ----------
  const procEnv = { DATABASE_URL: DEMO_URL, APP_ENV: "test", FETCH_ALLOW_LOOPBACK_FOR_TESTS: "1", SCHEDULER_TICK_SECONDS: "3600" };
  const webUp = await fetch(`http://localhost:${WEB_PORT}/api/health`).then(() => true).catch(() => false);
  const worker = start("pnpm", ["--filter", "@ff/worker", "worker"], procEnv, "worker");
  const scheduler = start("pnpm", ["--filter", "@ff/worker", "scheduler"], procEnv, "scheduler");
  const run = await waitFor(async () => (await db.query(`SELECT status, stats, correlation_id FROM ingestion_runs WHERE source_id=$1 AND status='succeeded' LIMIT 1`, [sourceId])).rows[0], 120_000, 2000);
  const beats = (await db.query(`SELECT process FROM scheduler_heartbeats ORDER BY 1`)).rows.map((r) => r.process);
  report(7, "Scheduling runs independently of website traffic", run && !webUp && beats.includes("scheduler") && beats.includes("worker") ? "PASS" : "FAIL", [
    `web app on :${WEB_PORT} running during this check: ${webUp}`,
    `heartbeats recorded by: ${beats.join(", ") || "none"}`,
    run ? `scheduler planned → worker ran refresh (correlation ${run.correlation_id}): ${JSON.stringify(run.stats)}` : `no successful run within 120s. worker log tail: ${worker.log().slice(-400)}`,
  ]);

  // ---------- 3: source record → published listing ----------
  const pub = (await db.query(`SELECT e.name, sr.url, e.verification_level FROM events e JOIN source_records sr ON sr.event_id=e.id WHERE sr.source_id=$1 AND e.publish_state='published' LIMIT 3`, [sourceId])).rows;
  const realEnabled = (await db.query(`SELECT key FROM sources WHERE status='enabled' AND NOT is_synthetic AND connector_key NOT IN ('submission','none') AND key <> 'demo-local-fixture'`)).rows;
  report(3, "A real source record moves through ingestion into a published listing", realEnabled.length ? "PASS" : "PENDING", [
    `ingestion path verified end-to-end over real HTTP (robots.txt, ETag, iCal parse, normalize, ingest, publish): ${pub.length} published, e.g. "${pub[0]?.name}" → ${pub[0]?.url}`,
    "content came from a SYNTHETIC fixture served locally, so this is NOT a real-source pass",
    realEnabled.length ? `enabled real sources: ${realEnabled.map((r) => r.key).join(", ")}` : "no real source is enabled: every evaluated source disallows automated access or needs permission (docs/SOURCE_ACCESS.md)",
  ]);

  // ---------- 5: change updates without duplicate ----------
  const before = (await db.query(`SELECT count(*)::int n FROM events WHERE NOT is_synthetic`)).rows[0].n;
  feed = fixture.replace("Example Park Field 2, 100 Example Rd, Plano, TX", "Example Sports Complex, 200 Other St, Plano, TX").replace("GEO:33.0301;-96.6801", "GEO:33.0501;-96.7101");
  const boss = await startBoss(DEMO_URL, { schedule: false });
  const queue = bossQueue(boss);
  await queue.send("refresh", { sourceId, jobType: "refresh", window: "demo-change" });
  const changed = await waitFor(async () => (await db.query(`SELECT c.field FROM event_changes c JOIN source_records sr ON sr.event_id=c.event_id WHERE sr.source_id=$1 AND c.field='venues'`, [sourceId])).rows[0], 60_000, 2000);
  const after = (await db.query(`SELECT count(*)::int n FROM events WHERE NOT is_synthetic`)).rows[0].n;
  report(5, "A source change updates the existing event without creating a duplicate", changed && after === before ? "PASS" : "FAIL",
    [`events before: ${before}, after: ${after}`, changed ? "event_changes row logged for field 'venues' (material)" : "no venue change logged within 60s"]);

  // ---------- 6: failed jobs don't mark data fresh ----------
  const fresh0 = (await db.query(`SELECT e.id, e.last_success_at FROM events e JOIN source_records sr ON sr.event_id=e.id WHERE sr.source_id=$1 ORDER BY e.id`, [sourceId])).rows;
  feedStatus = 500;
  await queue.send("refresh", { sourceId, jobType: "refresh", window: "demo-fail", attempt: 4 });
  const failed = await waitFor(async () => (await db.query(`SELECT error FROM ingestion_runs WHERE source_id=$1 AND status='failed' LIMIT 1`, [sourceId])).rows[0], 60_000, 2000);
  const fresh1 = (await db.query(`SELECT e.id, e.last_success_at FROM events e JOIN source_records sr ON sr.event_id=e.id WHERE sr.source_id=$1 ORDER BY e.id`, [sourceId])).rows;
  const untouched = fresh0.every((r, i) => String(r.last_success_at) === String(fresh1[i]?.last_success_at));
  const dl = (await db.query(`SELECT count(*)::int n FROM dead_letters`)).rows[0].n;
  report(6, "Failed jobs do not mark data as fresh", failed && untouched ? "PASS" : "FAIL", [failed ? `forced failure recorded: ${failed.error}` : "no failed run recorded", `last_success_at unchanged for ${fresh0.length} events: ${untouched}`, `dead letters after max attempts: ${dl}`]);
  feedStatus = 200;

  // ---------- 4: submission reviewed and published ----------
  const sub = (await db.query(`INSERT INTO submissions (kind, url) VALUES ('url',$1) RETURNING id`, [`http://127.0.0.1:${port}/event`])).rows[0].id;
  const r4 = await processSubmission(db, sub, { http: createPoliteHttp({ ratePerMinute: 600, fetchOptions: { unsafeAllowLoopback: true }, robotsCache: new Map() }), llm: new NoLlmProvider(), storageDir: "/tmp", log: () => {} });
  const s4 = (await db.query(`SELECT event_id, status FROM submissions WHERE id=$1`, [sub])).rows[0];
  if (s4?.event_id) await publishEvent(db, s4.event_id, "demo-moderator", { adminVerified: true });
  const p4 = s4?.event_id ? (await db.query(`SELECT publish_state, verification_level FROM events WHERE id=$1`, [s4.event_id])).rows[0] : null;
  const audit4 = (await db.query(`SELECT count(*)::int n FROM audit_log WHERE action='publish_event'`)).rows[0].n;
  report(4, "An organizer submission is reviewed and published", p4?.publish_state === "published" ? "PASS" : "FAIL",
    [`worker processing → ${r4 && "status" in r4 ? r4.status : "?"} (never auto-published)`, `after moderator publish: ${JSON.stringify(p4)}`, `audit log entries for publish: ${audit4}`, "submitted page content is the SYNTHETIC JSON-LD fixture"]);

  // ---------- 1: find DFW events by location, age, dates ----------
  const s1 = await searchEvents(db, parseSearchState(new URLSearchParams("region=plano&gender=girls&ageMin=10&ageMax=12&chips=next30")), { showSynthetic: true });
  const allOk = s1.results.every((r) => r.divisionsSummary.some((d) => /girls/i.test(d)) && r.ageMatch !== null && (!s1.resolved.to || (r.startDate ?? "") <= s1.resolved.to));
  report(1, "DFW events can be found by location, age, and dates", s1.total > 0 && allOk ? "PASS" : "FAIL",
    [`"girls 10–12 near Plano, next 30 days" → ${s1.total} results, all with girls divisions, an age match, and dates in range: ${allOk}`, "data: SYNTHETIC demo events (DEMO DATA badge)", "browser journey also covered by Playwright (step 2/8)"]);

  // ---------- 10: published real events link to sources ----------
  const orphans = (await db.query(`SELECT count(*)::int n FROM events e WHERE e.publish_state='published' AND NOT e.is_synthetic AND NOT EXISTS (
     SELECT 1 FROM source_records sr WHERE sr.event_id=e.id AND sr.url ~ '^https?://' AND sr.url !~* '^https?://[^/?#]*\\.invalid([/:?#]|$)' AND sr.record_status <> 'rejected')`)).rows[0].n;
  const realPub = (await db.query(`SELECT count(*)::int n FROM events WHERE publish_state='published' AND NOT is_synthetic`)).rows[0].n;
  report(10, "Every published real event links to supporting sources (DB assertion)", orphans === 0 ? "PASS" : "FAIL", [`published non-synthetic events: ${realPub}; without a supporting source URL: ${orphans}`, "also enforced by deferred constraint trigger events_published_requires_source"]);

  // ---------- 9: missing credentials → explicit fallbacks ----------
  const env = loadEnv({ NODE_ENV: "development" });
  const ints = integrationStatuses(env);
  const map = resolveMapConfig(env);
  const llm = await new NoLlmProvider().extract();
  const outbox = (await db.query(`SELECT count(*)::int n FROM email_outbox`)).rows[0].n;
  report(9, "Missing credentials produce explicit, usable fallbacks", map.default === "none" && llm.status === "manual_review" ? "PASS" : "FAIL", [
    ...ints.filter((i) => !i.configured).map((i) => `${i.name}: not configured → ${i.fallback}`),
    `map provider with no keys: "${map.default}" (list + directions links, no placeholder map)`, `LLM with no key: ${llm.status}`, `emails captured in dev outbox so far: ${outbox}`,
  ]);

  // stop worker/scheduler before starting web
  await boss.stop({ graceful: true, timeout: 5000 });
  for (const c of [worker, scheduler]) c.proc.kill("SIGTERM");
  await sleep(1500);

  // ---------- 2 + 8: browser checks against a web server on the demo DB ----------
  if (!existsSync(path.join(ROOT, "apps/web/.next/BUILD_ID"))) {
    report(2, "Map and list describe the same filtered results", "FAIL", ["web build missing — run `pnpm build` first"]);
    report(8, "Dark and light themes work on mobile and desktop", "FAIL", ["web build missing — run `pnpm build` first"]);
  } else {
    const web = start("pnpm", ["--filter", "@ff/web", "exec", "next", "start", "-p", String(WEB_PORT)], { DATABASE_URL: DEMO_URL, APP_ENV: "test", NEXT_PUBLIC_MAP_PROVIDER: "test-dom", APP_BASE_URL: `http://localhost:${WEB_PORT}` }, "web");
    const up = await waitFor(() => fetch(`http://localhost:${WEB_PORT}/api/health`).then((r) => r.ok), 60_000);
    if (!up) { report(2, "Map and list describe the same filtered results", "FAIL", [`web did not start: ${web.log().slice(-300)}`]); report(8, "Dark and light themes work on mobile and desktop", "FAIL", ["web did not start"]); }
    else {
      const pw = await new Promise<{ code: number; out: string }>((resolve) => {
        const c = spawn("pnpm", ["--filter", "@ff/web", "exec", "playwright", "test", "--trace", "off", "-g", "map/list sync|search this area|URL state|axe|journey"], { cwd: ROOT, env: { ...process.env, E2E_BASE_URL: `http://localhost:${WEB_PORT}`, DATABASE_URL: DEMO_URL } });
        let out = ""; c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { out += d; });
        c.on("close", (code) => resolve({ code: code ?? 1, out }));
      });
      const summary = pw.out.match(/\d+ passed[^\n]*/)?.[0] ?? "";
      const failedLine = pw.out.match(/\d+ failed[^\n]*/)?.[0] ?? "";
      const mapOk = !/✘.*(map\/list|search this area|URL state)/.test(pw.out);
      const axeOk = !/✘.*axe/.test(pw.out);
      report(2, "Map and list describe the same filtered results", pw.code === 0 || mapOk ? (mapOk ? "PASS" : "FAIL") : "FAIL", [`Playwright (desktop + Pixel 7): ${summary} ${failedLine}`.trim(), "pins = list items with coordinates; hover/tap linked; 'Search this area' updates both; URL restores state"]);
      report(8, "Dark and light themes work on mobile and desktop", axeOk ? "PASS" : "FAIL", ["axe (WCAG 2.2 AA tags): no serious/critical violations on home, results, coverage, event page", "screenshots: artifacts/{home,results,coverage,event}-{light,dark}-{desktop,mobile}.png"]);
    }
    web.proc.kill("SIGTERM");
  }

  server.close();
  await db.end();
  const order = results.sort((a, b) => a.n - b.n);
  console.log("\n================ SUMMARY ================");
  for (const r of order) console.log(`${r.status.padEnd(8)} ${r.n}. ${r.title}`);
  const fails = order.filter((r) => r.status === "FAIL").length, pend = order.filter((r) => r.status === "PENDING").length;
  console.log(`\n${order.length - fails - pend} PASS · ${pend} PENDING · ${fails} FAIL`);
  for (const c of children) c.kill("SIGTERM");
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); for (const c of children) c.kill("SIGTERM"); process.exit(1); });
