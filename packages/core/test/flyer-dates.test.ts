import { describe, expect, it } from "vitest";
import { readFlyerDate } from "../src";

describe("flyer dates route ambiguity to review", () => {
  it('"3/4" with no year or locale is ambiguous', () => {
    expect(readFlyerDate("Tournament 3/4 at Oak Park")).toMatchObject({ status: "ambiguous", reason: "numeric_without_year" });
  });
  it('"3/4/2027" with unknown locale is ambiguous (March 4 vs 3 April)', () => {
    expect(readFlyerDate("Kickoff 3/4/2027")).toMatchObject({ status: "ambiguous", reason: "numeric_locale_order_unknown" });
  });
  it('"Sat the 14th" (no month) is ambiguous', () => {
    expect(readFlyerDate("Join us Sat the 14th!")).toMatchObject({ status: "ambiguous", reason: "missing_month" });
  });
  it("a range across a month is ambiguous", () => {
    expect(readFlyerDate("March 30 - April 2, 2027")).toMatchObject({ status: "ambiguous", reason: "range_crosses_month" });
    expect(readFlyerDate("3/30-4/2/2027")).toMatchObject({ status: "ambiguous", reason: "range_crosses_month" });
  });
  it("a month name without a year is ambiguous", () => {
    expect(readFlyerDate("March 14")).toMatchObject({ status: "ambiguous", reason: "missing_year" });
  });
  it("fully specified dates are definite", () => {
    expect(readFlyerDate("Saturday, March 14, 2027")).toMatchObject({ status: "definite", start: "2027-03-14", end: "2027-03-14" });
    expect(readFlyerDate("April 10-11, 2027")).toMatchObject({ status: "definite", start: "2027-04-10", end: "2027-04-11" });
    expect(readFlyerDate("2027-05-01")).toMatchObject({ status: "definite", start: "2027-05-01" });
    expect(readFlyerDate("14/3/2027")).toMatchObject({ status: "definite", start: "2027-03-14" });
  });
  it("a known US locale resolves numeric order", () => {
    expect(readFlyerDate("3/4/2027", { knownLocale: "en-US" })).toMatchObject({ status: "definite", start: "2027-03-04" });
  });
  it("invalid dates are not coerced", () => {
    expect(readFlyerDate("February 30, 2027")).toMatchObject({ status: "ambiguous", reason: "invalid_date" });
  });
});
