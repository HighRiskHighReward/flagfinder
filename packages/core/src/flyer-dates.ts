/**
 * Conservative date reader for flyers, posts and OCR text. It returns a definite date only
 * when the text leaves no room for interpretation; everything else is routed to review.
 * Never guesses a year, a locale order, or a month.
 */
export type FlyerDateResult =
  | { status: "definite"; start: string; end: string; evidence: string }
  | { status: "ambiguous"; reason: AmbiguityReason; evidence: string }
  | { status: "none" };

export type AmbiguityReason =
  | "numeric_without_year"
  | "numeric_locale_order_unknown"
  | "missing_year"
  | "missing_month"
  | "range_crosses_month"
  | "invalid_date";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const DASH = "\\s*(?:-|–|—|to|thru|through)\\s*";

function iso(y: number, m: number, d: number): string | null {
  const s = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === s ? s : null;
}

export interface FlyerDateOptions {
  /** BCP-47 locale of the source if it is *known* (e.g. a US city website). Flyers: leave undefined. */
  knownLocale?: string;
}

export function readFlyerDate(text: string, opts: FlyerDateOptions = {}): FlyerDateResult {
  const t = text.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1");

  // ISO dates (optionally a range) are unambiguous.
  const isoRange = t.match(/(\d{4})-(\d{2})-(\d{2})(?:\s*(?:\/|-|–|—|to)\s*(\d{4})-(\d{2})-(\d{2}))?/);
  if (isoRange) {
    const a = iso(+isoRange[1]!, +isoRange[2]!, +isoRange[3]!);
    const b = isoRange[4] ? iso(+isoRange[4], +isoRange[5]!, +isoRange[6]!) : a;
    if (!a || !b || b < a) return { status: "ambiguous", reason: "invalid_date", evidence: isoRange[0] };
    return { status: "definite", start: a, end: b, evidence: isoRange[0] };
  }

  // Month name, day(-day | -Month day), optional year.
  const named = t.match(new RegExp(`${MONTH_RE}\\s+(\\d{1,2})(?:${DASH}(?:${MONTH_RE}\\s+)?(\\d{1,2}))?(?:,?\\s+(\\d{4}))?`));
  if (named) {
    const m1 = MONTHS[named[1]!.replace(".", "")]!;
    const d1 = +named[2]!;
    const m2 = named[3] ? MONTHS[named[3].replace(".", "")]! : m1;
    const d2 = named[4] ? +named[4] : d1;
    const year = named[5] ? +named[5] : null;
    if (m2 !== m1) return { status: "ambiguous", reason: "range_crosses_month", evidence: named[0] };
    if (year === null) return { status: "ambiguous", reason: "missing_year", evidence: named[0] };
    const a = iso(year, m1, d1);
    const b = iso(year, m2, d2);
    if (!a || !b || b < a) return { status: "ambiguous", reason: "invalid_date", evidence: named[0] };
    return { status: "definite", start: a, end: b, evidence: named[0] };
  }

  // Numeric dates: 3/4, 3/4/26, 3/4/2026, 3/30-4/2
  const numeric = t.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?(?:\s*(?:-|–|—|to)\s*(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?)?/);
  if (numeric) {
    const ev = numeric[0];
    if (numeric[4]) {
      // A numeric range: only month-local ranges could ever be definite; crossing months → review.
      const sameFirst = numeric[1] === numeric[4];
      if (!sameFirst) return { status: "ambiguous", reason: "range_crosses_month", evidence: ev };
    }
    const yearRaw = numeric[3] ?? numeric[6];
    if (!yearRaw) return { status: "ambiguous", reason: "numeric_without_year", evidence: ev };
    if (yearRaw.length !== 4) return { status: "ambiguous", reason: "numeric_without_year", evidence: ev };
    const p = +numeric[1]!, q = +numeric[2]!;
    let month: number, day: number;
    if (opts.knownLocale === "en-US") { month = p; day = q; }
    else if (p > 12 && q <= 12) { day = p; month = q; }
    else if (q > 12 && p <= 12) { month = p; day = q; }
    else if (p === q) { month = p; day = q; }
    else return { status: "ambiguous", reason: "numeric_locale_order_unknown", evidence: ev };
    const a = iso(+yearRaw, month, day);
    if (!a) return { status: "ambiguous", reason: "invalid_date", evidence: ev };
    let end = a;
    if (numeric[4]) {
      const endDay = opts.knownLocale === "en-US" || month === p ? +numeric[5]! : +numeric[4];
      const b = iso(+yearRaw, month, endDay);
      if (!b || b < a) return { status: "ambiguous", reason: "invalid_date", evidence: ev };
      end = b;
    }
    return { status: "definite", start: a, end, evidence: ev };
  }

  // Weekday + day number with no month: "Sat the 14th".
  const dayOnly = t.match(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s+(?:the\s+)?(\d{1,2})\b/);
  if (dayOnly) return { status: "ambiguous", reason: "missing_month", evidence: dayOnly[0] };

  return { status: "none" };
}
