import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarLink } from "../src";

const base = { uid: "e1@ff", name: "Spring, Flag; Fest", url: "https://x/e/1", startDate: "2027-03-13", endDate: "2027-03-14", startAt: null, endAt: null, location: "Oak Park, Plano", description: null, status: "scheduled", datePrecision: "day" };

describe("ICS", () => {
  it("all-day events use VALUE=DATE with exclusive end, no UTC shift", () => {
    const ics = buildIcs([base], "test");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270313");
    expect(ics).toContain("DTEND;VALUE=DATE:20270315");
    expect(ics).toContain("SUMMARY:Spring\\, Flag\\; Fest");
    expect(ics.endsWith("\r\n")).toBe(true);
  });
  it("timed events use UTC instants", () => {
    expect(buildIcs([{ ...base, startAt: "2027-03-13T14:00:00.000Z", endAt: null }], "t")).toContain("DTSTART:20270313T140000Z");
  });
  it("TBD dates are never exported", () => {
    expect(buildIcs([{ ...base, datePrecision: "tbd" }], "t")).not.toContain("VEVENT");
    expect(googleCalendarLink({ ...base, startDate: null })).toBeNull();
  });
  it("cancelled → STATUS:CANCELLED", () => {
    expect(buildIcs([{ ...base, status: "cancelled" }], "t")).toContain("STATUS:CANCELLED");
  });
});
