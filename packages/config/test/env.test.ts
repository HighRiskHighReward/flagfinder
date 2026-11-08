import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env";

describe("loadEnv AUTH_SECRET guard", () => {
  it("refuses to run in production without AUTH_SECRET", () => {
    expect(() => loadEnv({ APP_ENV: "production" })).toThrow(/AUTH_SECRET is required/);
  });
  it("allows `next build` (secrets not exposed at build time on some hosts)", () => {
    expect(() => loadEnv({ APP_ENV: "production", NEXT_PHASE: "phase-production-build" })).not.toThrow();
  });
  it("accepts production with AUTH_SECRET", () => {
    expect(loadEnv({ APP_ENV: "production", AUTH_SECRET: "x".repeat(32) }).appEnv).toBe("production");
  });
});
