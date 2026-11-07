import { describe, expect, it } from "vitest";
import { loadEnv } from "@ff/config";
import { resolveMapConfig } from "../../src/lib/map-config";

describe("map fallbacks", () => {
  it("no keys → no embedded map (list + directions links only), never a placeholder", () => {
    expect(resolveMapConfig(loadEnv({ NODE_ENV: "development" }))).toMatchObject({ available: [], default: "none" });
  });
  it("Google key → Google default; Apple selectable when configured", () => {
    const c = resolveMapConfig(loadEnv({ NODE_ENV: "development", NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "k", MAPKIT_TEAM_ID: "t", MAPKIT_KEY_ID: "i", MAPKIT_PRIVATE_KEY: "p" }));
    expect(c).toMatchObject({ available: ["google", "apple"], default: "google" });
  });
  it("the test-only renderer is refused in production", () => {
    expect(() => loadEnv({ NODE_ENV: "production", APP_ENV: "production", AUTH_SECRET: "x", NEXT_PUBLIC_MAP_PROVIDER: "test-dom" })).toThrow(/test-only/);
  });
});
