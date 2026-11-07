import { describe, expect, it } from "vitest";
import { plannerConflicts } from "../src";

const it_ = (id: string, s: string | null, e: string | null, before = 0, after = 0) => ({ eventId: id, name: id, startDate: s, endDate: e, travelDaysBefore: before, travelDaysAfter: after });

describe("season planner conflicts", () => {
  it("warns on overlapping game days", () => {
    expect(plannerConflicts([it_("a", "2027-03-13", "2027-03-14"), it_("b", "2027-03-14", "2027-03-14")]).conflicts).toMatchObject([{ kind: "date_overlap" }]);
  });
  it("warns on travel-day overlap", () => {
    const r = plannerConflicts([it_("a", "2027-03-13", "2027-03-14", 0, 1), it_("b", "2027-03-16", "2027-03-16", 1, 0)]);
    expect(r.conflicts).toMatchObject([{ kind: "travel_overlap" }]);
  });
  it("no conflict when separated; undated listed separately", () => {
    const r = plannerConflicts([it_("a", "2027-03-13", null), it_("b", "2027-03-20", null), it_("c", null, null)]);
    expect(r.conflicts).toEqual([]);
    expect(r.undated).toEqual(["c"]);
  });
});
