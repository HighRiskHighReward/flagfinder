import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SMTPServer } from "smtp-server";
import type { AddressInfo } from "node:net";
import type pg from "pg";
import { SmtpTransport } from "../src/email";

/** Local SMTP sink standing in for Mailpit (same protocol path). */
describe("SMTP transport to a local catcher (Mailpit-compatible)", () => {
  const received: string[] = [];
  let server: SMTPServer; let port = 0;
  beforeAll(async () => {
    server = new SMTPServer({ authOptional: true, disabledCommands: ["STARTTLS"], onData(stream, _s, cb) { let d = ""; stream.on("data", (c) => { d += c; }); stream.on("end", () => { received.push(d); cb(); }); } });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  it("delivers an alert email to the local catcher and records it", async () => {
    const recorded: unknown[] = [];
    const db = { query: async (_q: string, p: unknown[]) => { recorded.push(p); return { rows: [] }; } } as unknown as pg.Pool;
    const t = new SmtpTransport(`smtp://localhost:${port}`, "FlagFinder <alerts@flagfinder.example>", db, "development");
    await t.send({ to: "coach@example.test", subject: "Spring Classic changed", text: "start date changed\nUnsubscribe: http://x" });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatch(/Subject: Spring Classic changed/);
    expect(received[0]).toMatch(/coach@example.test/);
    expect(recorded).toHaveLength(1);
  });
});
