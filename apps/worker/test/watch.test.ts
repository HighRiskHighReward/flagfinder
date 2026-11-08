import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FetchResult, PoliteHttp } from "@ff/connectors";
import { closePools } from "@ff/db";
import { db, truncateAll } from "../../../packages/db/test/helpers";
import { visibleText, watchPages } from "../src/watch";

const silent = () => {};
let pages: Record<string, FetchResult>;
const http: PoliteHttp = { get: async (url) => pages[url] ?? { kind: "missing", url, status: 404, fetchedAt: new Date() } };
const ok = (url: string, body: string): FetchResult => ({ kind: "ok", url, status: 200, contentType: "text/html", body, etag: null, lastModified: null, fetchedAt: new Date() });
const URL1 = "https://organizer.example.org/winter";

async function makeWatch(extra: { status?: string } = {}) {
  const r = await db().query(
    `INSERT INTO sources (key, name, url, connector_key, parser_version, access_method, permission_notes, status, status_reason, config, refresh_cadence_minutes)
     VALUES ('w','Watched org','https://organizer.example.org/','watch','watch-1.0.0','static_html','test',$1,'test',$2,1440) RETURNING id`,
    [extra.status ?? "enabled", JSON.stringify({ pageUrls: [URL1] })]);
  return r.rows[0].id as string;
}
const subs = async () => (await db().query(`SELECT url, submitter_note, status FROM submissions ORDER BY created_at`)).rows;

beforeEach(async () => { await truncateAll(); pages = { [URL1]: ok(URL1, "<html><body><h1>Winter 7v7</h1><p>Dec 6 – Jan 10</p><script>var t=1</script></body></html>") }; });
afterAll(async () => { await closePools(); });

describe("watched pages (ADR-025)", () => {
  it("files a submission the first time a page is seen, then only when its visible text changes", async () => {
    const id = await makeWatch();
    const t0 = new Date("2026-11-08T12:00:00Z");
    await watchPages(db(), { log: silent, httpFor: () => http, now: t0 });
    expect(await subs()).toEqual([expect.objectContaining({ url: URL1, status: "received", submitter_note: expect.stringMatching(/added/) })]);
    expect((await db().query(`SELECT last_success_at FROM sources WHERE id=$1`, [id])).rows[0].last_success_at).toEqual(t0);

    // Next day, same text (only script changed) → nothing new. Moderator already handled the first one.
    await db().query(`UPDATE submissions SET status='published'`);
    pages[URL1] = ok(URL1, "<html><body><h1>Winter 7v7</h1><p>Dec 6 – Jan 10</p><script>var t=2</script></body></html>");
    await watchPages(db(), { log: silent, httpFor: () => http, now: new Date("2026-11-09T13:00:00Z") });
    expect(await subs()).toHaveLength(1);

    // Visible text changes → a new submission.
    pages[URL1] = ok(URL1, "<html><body><h1>Winter 7v7</h1><p>Dec 13 – Jan 17</p></body></html>");
    await watchPages(db(), { log: silent, httpFor: () => http, now: new Date("2026-11-10T14:00:00Z") });
    const s = await subs();
    expect(s).toHaveLength(2);
    expect(s[1]).toMatchObject({ status: "received", submitter_note: expect.stringMatching(/changed/) });
  });

  it("respects cadence and doesn't stack submissions while one is still in review", async () => {
    await makeWatch();
    await watchPages(db(), { log: silent, httpFor: () => http, now: new Date("2026-11-08T12:00:00Z") });
    pages[URL1] = ok(URL1, "<p>changed</p>");
    await watchPages(db(), { log: silent, httpFor: () => http, now: new Date("2026-11-08T18:00:00Z") }); // within the day → not due
    expect(await subs()).toHaveLength(1);
    await watchPages(db(), { log: silent, httpFor: () => http, now: new Date("2026-11-09T13:00:00Z") }); // due, but first is still 'received'
    expect(await subs()).toHaveLength(1);
  });

  it("a failed or disallowed fetch never advances freshness and files nothing", async () => {
    const id = await makeWatch();
    pages[URL1] = { kind: "disallowed", url: URL1, reason: "robots.txt disallows", fetchedAt: new Date() };
    await watchPages(db(), { log: silent, httpFor: () => http, now: new Date("2026-11-08T12:00:00Z") });
    expect(await subs()).toHaveLength(0);
    const src = (await db().query(`SELECT last_success_at, consecutive_failures FROM sources WHERE id=$1`, [id])).rows[0];
    expect(src).toMatchObject({ last_success_at: null, consecutive_failures: 1 });
  });

  it("ignores sources that aren't enabled", async () => {
    await makeWatch({ status: "pending_permission" });
    expect((await watchPages(db(), { log: silent, httpFor: () => http })).sources).toBe(0);
  });

  it("visible text drops scripts, styles and tags", () => {
    expect(visibleText("<style>x{}</style><p>A&nbsp;<b>B</b></p><script>z</script>")).toBe("A B");
  });
});
