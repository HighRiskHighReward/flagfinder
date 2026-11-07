import { describe, expect, it } from "vitest";
import { formatLocalDate, rangesOverlap, thisWeekend, todayIn, zonedTimeToUtc } from "../src";

describe("date overlap", () => {
  it("multi-day event starting before the range is included", () => {
    expect(rangesOverlap("2026-11-13", "2026-11-15", "2026-11-14", "2026-12-14")).toBe(true);
  });
  it("league session within the range is included; outside is excluded", () => {
    expect(rangesOverlap("2026-12-01", "2026-12-10", "2026-11-14", "2026-12-14")).toBe(true);
    expect(rangesOverlap("2026-10-01", "2026-11-13", "2026-11-14", "2026-12-14")).toBe(false);
  });
});

describe("timezones and DST", () => {
  it("event on US DST-start weekend converts with the correct offset", () => {
    // 2027-03-14 is the US spring-forward day. 9:00 CDT = 14:00Z; day before 9:00 CST = 15:00Z.
    expect(zonedTimeToUtc("2027-03-14", "09:00", "America/Chicago").toISOString()).toBe("2027-03-14T14:00:00.000Z");
    expect(zonedTimeToUtc("2027-03-13", "09:00", "America/Chicago").toISOString()).toBe("2027-03-13T15:00:00.000Z");
  });
  it("fall-back weekend", () => {
    expect(zonedTimeToUtc("2026-11-01", "10:00", "America/Chicago").toISOString()).toBe("2026-11-01T16:00:00.000Z");
  });
  it("all-day dates are not shifted by UTC conversion", () => {
    expect(formatLocalDate("2026-11-14")).toBe("Sat, Nov 14, 2026");
    // Late evening in Chicago is still the 13th locally even though UTC is the 14th.
    expect(todayIn("America/Chicago", new Date("2026-11-14T03:30:00Z"))).toBe("2026-11-13");
  });
  it("non-US timezone", () => {
    expect(zonedTimeToUtc("2027-07-10", "10:00", "Europe/Berlin").toISOString()).toBe("2027-07-10T08:00:00.000Z");
    expect(todayIn("Australia/Sydney", new Date("2026-11-14T15:00:00Z"))).toBe("2026-11-15");
  });
  it("this weekend", () => {
    expect(thisWeekend("2026-11-11")).toEqual({ from: "2026-11-14", to: "2026-11-15" });
    expect(thisWeekend("2026-11-15")).toEqual({ from: "2026-11-15", to: "2026-11-15" });
  });
});
