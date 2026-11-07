import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL } from "../../../packages/db/test/global-setup";
import { bossQueue, DEAD_LETTER, startBoss } from "../src/queue";

/** Integration against real pg-boss: the queue wrapper must accept every option shape the worker uses. */
describe("pg-boss queue wrapper", () => {
  let stop: () => Promise<void> = async () => {};
  afterAll(() => stop());
  it("sends with and without optional fields", async () => {
    const boss = await startBoss(TEST_DATABASE_URL, { schedule: false });
    stop = () => boss.stop({ graceful: false, timeout: 2000 });
    const q = bossQueue(boss);
    expect(await q.send("refresh", { sourceId: "x" })).toBeTruthy();
    expect(await q.send(DEAD_LETTER, { lastError: "e" })).toBeTruthy();
    expect(await q.send("refresh", { a: 1 }, { startAfterSeconds: 12.7, priority: 60 })).toBeTruthy();
    const a = await q.send("refresh", { a: 2 }, { singletonKey: "refresh:s1:w1" });
    const b = await q.send("refresh", { a: 3 }, { singletonKey: "refresh:s1:w1" });
    expect(a).toBeTruthy();
    // With the standard queue policy pg-boss may accept a duplicate trigger; exactly-once per
    // (source, job type, window) is enforced by the ingestion_runs unique index (worker.test.ts).
    expect(b).toBeTruthy();
  });
});
