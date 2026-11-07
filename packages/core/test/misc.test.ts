import { describe, expect, it } from "vitest";
import {
  classifySportScope, computeVerification, detectStatusSignal, fullJitterDelayMs, hourOffsetSeconds, nextStatus,
  parseRetryAfterMs, parseSearchState, resolveSearch, serializeSearchState, TokenBucket, directionsLinks,
} from "../src";

describe("status evidence", () => {
  it("404 sets source_missing only, never cancelled", () => {
    const sig = detectStatusSignal({ httpStatus: 404 });
    expect(nextStatus("scheduled", sig)).toMatchObject({ status: "source_missing", needsReview: true });
  });
  it("explicit cancellation sets cancelled with evidence", () => {
    const sig = detectStatusSignal({ text: "Update: the tournament has been cancelled due to field conditions." });
    expect(nextStatus("scheduled", sig)).toMatchObject({ status: "cancelled" });
    expect(nextStatus("scheduled", sig).evidence).toMatch(/cancelled/);
    expect(detectStatusSignal({ schemaEventStatus: "https://schema.org/EventPostponed" })).toMatchObject({ status: "postponed" });
  });
});

describe("verification", () => {
  it("a successful fetch never yields organizer_confirmed", () => {
    expect(computeVerification({ current: "discovered_unverified", successfulSourceCount: 1, organizerConfirmed: false, adminVerified: false })).toBe("source_checked");
    expect(computeVerification({ current: "source_checked", successfulSourceCount: 5, organizerConfirmed: false, adminVerified: false })).toBe("multi_source_corroborated");
  });
  it("human levels are sticky", () => {
    expect(computeVerification({ current: "admin_verified", successfulSourceCount: 1, organizerConfirmed: false, adminVerified: false })).toBe("admin_verified");
  });
});

describe("scope", () => {
  it("classifies flag vs tackle vs mixed", () => {
    expect(classifySportScope("NFL FLAG youth league")).toBe("flag");
    expect(classifySportScope("Youth tackle football, full pads")).toBe("tackle");
    expect(classifySportScope("Flag and tackle divisions")).toBe("mixed");
    expect(classifySportScope("7v7 passing league")).toBe("7v7_passing_non_flag");
  });
});

describe("scheduler math", () => {
  it("full jitter stays within [0, cap)", () => {
    for (let a = 0; a < 12; a++) {
      const d = fullJitterDelayMs(a, 1000, 60_000, () => 0.999);
      expect(d).toBeLessThan(Math.min(60_000, 1000 * 2 ** a));
      expect(fullJitterDelayMs(a, 1000, 60_000, () => 0)).toBe(0);
    }
  });
  it("Retry-After seconds and HTTP-date", () => {
    expect(parseRetryAfterMs("120")).toBe(120_000);
    expect(parseRetryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT", Date.parse("Wed, 21 Oct 2026 07:27:00 GMT"))).toBe(60_000);
  });
  it("hour offset is deterministic and < 3600", () => {
    expect(hourOffsetSeconds("abc")).toBe(hourOffsetSeconds("abc"));
    expect(hourOffsetSeconds("abc")).toBeLessThan(3600);
  });
  it("token bucket throttles", () => {
    let now = 0;
    const b = new TokenBucket(6, 1, () => now);
    expect(b.take()).toBe(0);
    expect(b.take()).toBe(10_000);
    now = 10_000;
    expect(b.take()).toBe(0);
  });
});

describe("URL search state", () => {
  it("round-trips canonically", () => {
    const s = parseSearchState(new URLSearchParams("gender=girls&ageMin=10&ageMax=12&region=plano&chips=next30&sort=soonest&bogus=1"));
    const qs = serializeSearchState(s);
    expect(qs).toBe("region=plano&ageMin=10&ageMax=12&gender=girls&chips=next30&sort=soonest");
    expect(serializeSearchState(parseSearchState(new URLSearchParams(qs)))).toBe(qs);
  });
  it("invalid values are dropped, not trusted", () => {
    const s = parseSearchState(new URLSearchParams("ageMin=abc&region=../../etc&gender=girls,<script>"));
    expect(s.ageMin).toBeUndefined();
    expect(s.region).toBeUndefined();
    expect(s.gender).toEqual(["girls"]);
  });
  it("defaults to upcoming DFW, soonest", () => {
    const r = resolveSearch(parseSearchState(new URLSearchParams()), "2026-11-07");
    expect(r).toMatchObject({ regionSlug: "dfw", from: "2026-11-07", sort: "soonest", page: 1 });
  });
  it("directions links work without keys", () => {
    const l = directionsLinks({ lat: 33, lon: -96.7, name: "Oak Point Park" });
    expect(l.google).toContain("33%2C-96.7");
    expect(l.apple).toContain("ll=33,-96.7");
  });
});
