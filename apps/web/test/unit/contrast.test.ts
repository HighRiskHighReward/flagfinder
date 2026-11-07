import { describe, expect, it } from "vitest";
import { contrastPairs, contrastRatio, semantic } from "../../src/design/tokens";

describe("design token contrast (WCAG 2.2 AA)", () => {
  it("raw gold #D4AF37 on white fails AA for text — and is never a text token in light mode", () => {
    expect(contrastRatio("#D4AF37", "#FFFFFF")).toBeLessThan(4.5);
    for (const p of contrastPairs.filter((x) => x.min === 4.5)) {
      expect(!(semantic.light[p.fg] === "#D4AF37" && ["#FFFFFF", semantic.light.surface].includes(semantic.light[p.bg]!))).toBe(true);
    }
  });
  for (const theme of ["light", "dark"] as const) {
    for (const p of contrastPairs) {
      it(`${theme}: ${p.fg} on ${p.bg} ≥ ${p.min} (${p.use})`, () => {
        const r = contrastRatio(semantic[theme][p.fg]!, semantic[theme][p.bg]!);
        expect(r).toBeGreaterThanOrEqual(p.min);
      });
    }
  }
});
