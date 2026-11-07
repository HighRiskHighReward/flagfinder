import { describe, expect, it } from "vitest";
import { compareFees, formatFee, parsePublishedPrice, type Fee } from "../src";

const unknown: Fee = { status: "unknown", amountMinor: null, currency: null, basis: "unknown" };
const perTeam: Fee = { status: "known", amountMinor: 30000, currency: "USD", basis: "per_team" };
const perPlayer: Fee = { status: "known", amountMinor: 4500, currency: "USD", basis: "per_player" };

describe("fees", () => {
  it("unknown fee stays unknown, never $0 or free", () => {
    expect(formatFee(unknown)).toBe("Price not published");
    expect(formatFee(unknown)).not.toMatch(/\$0|free/i);
  });
  it("displays basis", () => {
    expect(formatFee(perTeam)).toBe("$300 per team");
    expect(formatFee(perPlayer)).toBe("$45 per player");
  });
  it("sorts known prices first (grouped by basis) and unknown last", () => {
    const sorted = [unknown, perTeam, perPlayer].sort(compareFees);
    expect(sorted).toEqual([perPlayer, perTeam, unknown]);
  });
  it("parses published prices and basis", () => {
    expect(parsePublishedPrice("$300 per team")).toEqual({ amountMinor: 30000, basis: "per_team" });
    expect(parsePublishedPrice("$45.50/player")).toEqual({ amountMinor: 4550, basis: "per_player" });
    expect(parsePublishedPrice("Contact us for pricing")).toBeNull();
  });
});
