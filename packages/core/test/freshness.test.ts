import { describe, expect, it } from "vitest";
import { applyOutcome, type Freshness } from "../src";

const t0 = new Date("2026-11-01T00:00:00Z");
const base: Freshness = { lastCheckedAt: t0, lastSuccessAt: t0, sourceUpdatedAt: null, lastMaterialChangeAt: t0 };

describe("freshness", () => {
  it("failed fetch leaves last_success_at and last_material_change_at unchanged", () => {
    const at = new Date("2026-11-02T00:00:00Z");
    for (const o of [{ kind: "failure", at, error: "timeout" }, { kind: "parse_failure", at, error: "bad" }, { kind: "missing", at, httpStatus: 404 }] as const) {
      const n = applyOutcome(base, o);
      expect(n.lastSuccessAt).toBe(t0);
      expect(n.lastMaterialChangeAt).toBe(t0);
      expect(n.lastCheckedAt).toBe(at);
    }
  });
  it("success without material change advances only success", () => {
    const at = new Date("2026-11-03T00:00:00Z");
    const n = applyOutcome(base, { kind: "success", at, materialChange: false });
    expect(n.lastSuccessAt).toBe(at);
    expect(n.lastMaterialChangeAt).toBe(t0);
  });
  it("material change advances last_material_change_at", () => {
    const at = new Date("2026-11-03T00:00:00Z");
    expect(applyOutcome(base, { kind: "success", at, materialChange: true }).lastMaterialChangeAt).toBe(at);
  });
});
