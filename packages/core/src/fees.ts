import type { Fee, PricingBasis } from "./types";

const BASIS_LABEL: Record<PricingBasis, string> = {
  per_team: "per team",
  per_player: "per player",
  per_family: "per family",
  unknown: "basis not published",
};

/** Unknown is never "free" and never $0. */
export function formatFee(fee: Fee, locale = "en-US"): string {
  if (fee.status !== "known" || fee.amountMinor == null || !fee.currency) return "Price not published";
  const digits = currencyDigits(fee.currency);
  const amount = fee.amountMinor / 10 ** digits;
  const money = amount === 0
    ? "Free"
    : new Intl.NumberFormat(locale, { style: "currency", currency: fee.currency, minimumFractionDigits: amount % 1 === 0 ? 0 : digits }).format(amount);
  return amount === 0 ? `Free (${BASIS_LABEL[fee.basis]})` : `${money} ${BASIS_LABEL[fee.basis]}`;
}

export function currencyDigits(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/**
 * Sort key for "Lowest published price". Unknown prices sort last. Different bases are not
 * directly comparable, so we group by basis (per player, per family, per team) inside
 * known prices, then by amount; this keeps a $40/player fee from appearing "cheaper" than
 * a $300/team fee in a misleading way while remaining deterministic. Currencies differ →
 * grouped by currency code (no FX conversion is performed).
 */
export function feeSortKey(fee: Fee): [number, string, number, number] {
  if (fee.status !== "known" || fee.amountMinor == null || !fee.currency) return [1, "", 0, Number.MAX_SAFE_INTEGER];
  const basisRank: Record<PricingBasis, number> = { per_player: 0, per_family: 1, per_team: 2, unknown: 3 };
  return [0, fee.currency, basisRank[fee.basis], fee.amountMinor];
}

export function compareFees(a: Fee, b: Fee): number {
  const ka = feeSortKey(a), kb = feeSortKey(b);
  for (let i = 0; i < ka.length; i++) {
    const x = ka[i]!, y = kb[i]!;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** Parse a published price string in a known currency into minor units. Ambiguous → null. */
export function parsePublishedPrice(text: string, currency = "USD"): { amountMinor: number; basis: PricingBasis } | null {
  const m = text.replace(/,/g, "").match(/[$€£]\s?(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const amountMinor = Math.round(parseFloat(m[1]!) * 10 ** currencyDigits(currency));
  const lower = text.toLowerCase();
  const basis: PricingBasis = /per\s+(player|athlete|person|participant)|\/\s*(player|athlete)/.test(lower)
    ? "per_player"
    : /per\s+team|\/\s*team|team fee/.test(lower)
      ? "per_team"
      : /per\s+family/.test(lower) ? "per_family" : "unknown";
  return { amountMinor, basis };
}
