/** Local-date helpers. All-day dates are ISO 'YYYY-MM-DD' strings in the event's IANA tz. */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** Today's local date in a given IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Inclusive-range overlap: an event [s,e] overlaps query [qs,qe]. Mirrors SQL `during && daterange(qs,qe,'[]')`. */
export function rangesOverlap(s: string, e: string | null, qs: string, qe: string): boolean {
  const end = e ?? s;
  return s <= qe && end >= qs;
}

/** The upcoming weekend (Sat–Sun) relative to a local date; if today is Sat/Sun, the current one. */
export function thisWeekend(today: string): { from: string; to: string } {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sun..6 Sat
  if (dow === 0) return { from: today, to: today };
  const toSat = (6 - dow + 7) % 7;
  const sat = addDays(today, toSat);
  return { from: sat, to: addDays(sat, 1) };
}

/**
 * Convert a local wall-clock time in an IANA zone to a UTC instant (DST-correct).
 * Ambiguous fall-back times resolve to the earlier offset; nonexistent spring-forward
 * times resolve forward by the gap.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset1 = tzOffsetMs(new Date(guess), timeZone);
  let instant = guess - offset1;
  const offset2 = tzOffsetMs(new Date(instant), timeZone);
  if (offset2 !== offset1) instant = guess - offset2;
  return new Date(instant);
}

function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Format a local date for display without any timezone shifting. */
export function formatLocalDate(date: string, locale = "en-US", opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" }): string {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function formatDateRange(start: string | null, end: string | null, precision: string, locale = "en-US"): string {
  if (!start || precision === "tbd") return "Dates to be announced";
  if (precision === "month") return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${start}T00:00:00Z`));
  if (!end || end === start) return formatLocalDate(start, locale);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const a = formatLocalDate(start, locale, { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
  const b = formatLocalDate(end, locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return `${a} – ${b}`;
}
