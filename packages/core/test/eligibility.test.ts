import { describe, expect, it } from "vitest";
import { matchAge, type AgeRule } from "../src";

const ages10to12: AgeRule = { type: "age_range", min: 10, max: 12, cutoffDate: null, original: "Ages 10–12" };
const u12Aug31: AgeRule = { type: "age_under", min: null, max: 12, cutoffDate: "2026-08-31", original: "12U (age as of Aug 31, 2026)" };
const unknown: AgeRule = { type: "unknown", min: null, max: null, cutoffDate: null, original: null };
const eventDate = "2026-11-14";

describe("eligibility semantics", () => {
  it('"Ages 10–12" and "12U (cutoff Aug 31)" are matched differently', () => {
    // A 13-year-old on game day: not eligible for ages 10–12; could have been 12 on Aug 31 → possible for 12U.
    expect(matchAge(ages10to12, { min: 13, max: 13 }, eventDate)).toBe("no");
    expect(matchAge(u12Aug31, { min: 13, max: 13 }, eventDate)).toBe("possible");
  });
  it("definite only when every age in the band qualifies under a known rule", () => {
    expect(matchAge(ages10to12, { min: 10, max: 12 }, eventDate)).toBe("definite");
    expect(matchAge(ages10to12, { min: 11, max: 13 }, eventDate)).toBe("possible");
    expect(matchAge(u12Aug31, { min: 10, max: 12 }, eventDate)).toBe("definite");
    expect(matchAge(ages10to12, { min: 6, max: 8 }, eventDate)).toBe("no");
  });
  it("unknown rules yield a confirm label, never definite", () => {
    expect(matchAge(unknown, { min: 10, max: 12 }, eventDate)).toBe("possible");
    expect(matchAge({ ...u12Aug31 }, { min: 10, max: 12 }, null)).toBe("possible");
  });
  it("cutoff after the event widens the band upward", () => {
    const u12Dec31: AgeRule = { type: "age_under", min: null, max: 12, cutoffDate: "2026-12-31", original: "12U as of Dec 31" };
    expect(matchAge(u12Dec31, { min: 12, max: 12 }, eventDate)).toBe("possible");
    expect(matchAge(u12Dec31, { min: 10, max: 11 }, eventDate)).toBe("definite");
  });
  it("birth-year rules", () => {
    const by: AgeRule = { type: "birth_year", min: null, max: null, birthYearMin: 2014, birthYearMax: 2016, cutoffDate: null, original: "Born 2014–2016" };
    expect(matchAge(by, { min: 11, max: 11 }, "2026-11-14")).toBe("definite"); // born 2014 or 2015
    expect(matchAge(by, { min: 12, max: 12 }, "2026-11-14")).toBe("possible"); // 2013 or 2014
  });
});
