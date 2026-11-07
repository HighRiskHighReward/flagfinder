import { describe, expect, it } from "vitest";
import { isCandidatePair, scorePair, type DedupEventView } from "../src";

const base: DedupEventView = {
  id: "a", name: "Plano Fall Flag Classic", organizerName: "North Texas Flag", startDate: "2026-11-14", endDate: "2026-11-15",
  editionId: null, seriesId: null, registrationUrl: "https://reg.example.org/plano-classic", location: { lat: 33.02, lon: -96.70 }, externalIds: ["src1:123"],
};

describe("dedup scoring", () => {
  it("same event from two sources auto-merges", () => {
    const b = { ...base, id: "b", name: "Plano Fall Flag Classic 2026", externalIds: ["src2:abc"], registrationUrl: "https://www.reg.example.org/plano-classic?utm_source=x" };
    const s = scorePair(base, b);
    expect(isCandidatePair(base, b)).toBe(true);
    expect(s.decision).toBe("auto_merge");
  });
  it("borderline pair goes to review", () => {
    const b = { ...base, id: "b", name: "Plano Flag Fall Bash", organizerName: null, externalIds: ["src2:x"], registrationUrl: null, location: { lat: 33.03, lon: -96.72 } };
    const s = scorePair(base, b);
    expect(s.decision).toBe("review");
    expect(s.score).toBeGreaterThanOrEqual(0.6);
    expect(s.score).toBeLessThan(0.9);
  });
  it("different editions never merge", () => {
    const a = { ...base, editionId: "e2025" };
    const b = { ...base, id: "b", editionId: "e2026", externalIds: [] };
    expect(scorePair(a, b)).toMatchObject({ decision: "distinct", blockedReason: "different_edition" });
  });
  it("two weekends of one series stay separate", () => {
    const b = { ...base, id: "b", startDate: "2026-11-21", endDate: "2026-11-22", externalIds: [] };
    expect(scorePair(base, b).decision).toBe("distinct");
  });
  it("2025 and 2026 dates of a series stay separate even with same registration URL", () => {
    const b = { ...base, id: "b", startDate: "2025-11-15", endDate: "2025-11-16", externalIds: [] };
    expect(scorePair(base, b).decision).toBe("distinct");
  });
});
