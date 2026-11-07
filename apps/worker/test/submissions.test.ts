import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPoliteHttp, resetRateLimiters } from "@ff/connectors";
import { closePools, publishEvent } from "@ff/db";
import { LocalPrivateStorage, NoLlmProvider } from "@ff/providers";
import { db, truncateAll } from "../../../packages/db/test/helpers";
import { migrate } from "../../../packages/db/src/migrate";
import { processSubmission } from "../src/submissions";

const PAGE = readFileSync(fileURLToPath(new URL("../../../packages/connectors/fixtures/jsonld/synthetic-event-page.html", import.meta.url)), "utf8");
const silent = () => {};
let server: Server; let port = 0;
const storageDir = mkdtempSync(path.join(tmpdir(), "ff-up-"));

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/robots.txt") { res.writeHead(200); return res.end("User-agent: *\nAllow: /\n"); }
    if (req.url === "/event") { res.writeHead(200, { "content-type": "text/html" }); return res.end(PAGE); }
    if (req.url === "/login-wall") { res.writeHead(403); return res.end(); }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); await closePools(); });
beforeEach(async () => {
  await truncateAll(); resetRateLimiters();
  // sources were truncated; re-apply the registry rows the submission flow needs
  await db().query(`INSERT INTO sources (key, name, url, connector_key, parser_version, access_method, permission_notes, status, status_reason) VALUES ('organizer-submissions','Organizer submissions','https://flagfinder.example/submit','submission','1','manual','moderated','enabled','moderated')`);
});
void migrate;
const deps = () => ({ http: createPoliteHttp({ ratePerMinute: 6000, fetchOptions: { unsafeAllowLoopback: true }, robotsCache: new Map() }), llm: new NoLlmProvider(), storageDir, log: silent });

describe("organizer submissions → moderation → publish", () => {
  it("a URL submission is extracted, reviewed, and published with its source link", async () => {
    const url = `http://127.0.0.1:${port}/event`;
    const sub = (await db().query(`INSERT INTO submissions (kind, url) VALUES ('url',$1) RETURNING id`, [url])).rows[0].id;
    expect(await processSubmission(db(), sub, deps())).toEqual({ status: "in_review" });
    const s = (await db().query(`SELECT status, event_id FROM submissions WHERE id=$1`, [sub])).rows[0];
    const ev = (await db().query(`SELECT publish_state, name FROM events WHERE id=$1`, [s.event_id])).rows[0];
    expect(ev.publish_state).toBe("in_review"); // never auto-published
    expect((await db().query(`SELECT kind FROM review_items WHERE ref_id=$1`, [sub])).rows[0].kind).toBe("submission");
    await publishEvent(db(), s.event_id, "moderator@test", { adminVerified: true });
    const pub = (await db().query(`SELECT e.publish_state, e.verification_level, sr.url FROM events e JOIN source_records sr ON sr.event_id=e.id WHERE e.id=$1`, [s.event_id])).rows[0];
    expect(pub).toMatchObject({ publish_state: "published", verification_level: "admin_verified", url });
    expect((await db().query(`SELECT status FROM submissions WHERE id=$1`, [sub])).rows[0].status).toBe("published");
  });

  it("an unreadable link is kept as awaiting_verification and nothing is guessed", async () => {
    const sub = (await db().query(`INSERT INTO submissions (kind, url) VALUES ('post_url',$1) RETURNING id`, [`http://127.0.0.1:${port}/login-wall`])).rows[0].id;
    expect(await processSubmission(db(), sub, deps())).toEqual({ status: "awaiting_verification" });
    expect((await db().query(`SELECT count(*)::int n FROM events`)).rows[0].n).toBe(0);
  });

  it("no LLM key: flyer goes to manual review; publishing requires a real source URL (not a placeholder)", async () => {
    const key = await new LocalPrivateStorage(storageDir).put(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "png");
    const up = (await db().query(`INSERT INTO uploads (storage_key, mime, byte_size, sha256) VALUES ($1,'image/png',8,'x') RETURNING id`, [key])).rows[0].id;
    const sub = (await db().query(`INSERT INTO submissions (kind, upload_id) VALUES ('flyer',$1) RETURNING id`, [up])).rows[0].id;
    expect(await processSubmission(db(), sub, deps())).toEqual({ status: "in_review" });
    expect((await db().query(`SELECT reason FROM review_items WHERE ref_id=$1`, [sub])).rows[0].reason).toMatch(/No LLM key/);
    // A placeholder .invalid URL never satisfies Invariant 6.
    const src = (await db().query(`SELECT id FROM sources WHERE key='organizer-submissions'`)).rows[0].id;
    const e = (await db().query(`INSERT INTO events (slug, name, timezone, sport_scope) VALUES ('f1','Flyer event','America/Chicago','flag') RETURNING id`)).rows[0].id;
    await db().query(`INSERT INTO source_records (source_id, external_key, url, event_id, parser_version, content_hash, normalized) VALUES ($1,'f','https://flyer.invalid/x',$2,'m','h','{}')`, [src, e]);
    await expect(publishEvent(db(), e, "mod")).rejects.toThrow(/Invariant 6/);
    await publishEvent(db(), e, "mod", { sourceUrl: "https://organizer.example.org/spring-flyer" });
    expect((await db().query(`SELECT publish_state FROM events WHERE id=$1`, [e])).rows[0].publish_state).toBe("published");
  });
});
