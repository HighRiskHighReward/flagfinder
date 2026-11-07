import type { Metadata } from "next";
import Link from "next/link";
import { addDays, parseSearchState, serializeSearchState } from "@ff/core";
import { searchEvents } from "@ff/db";
import { db, showDemoData } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar", robots: { index: false, follow: true } };

/** Month calendar of the same search (same filters in the URL). Multi-day events appear on each day. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : new Date().toISOString().slice(0, 7);
  const first = `${month}-01`;
  const last = addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1);
  const state = parseSearchState({ ...sp, from: first, to: last, chips: undefined });
  const data = await searchEvents(db(), state, { showSynthetic: showDemoData() });
  const startDow = new Date(`${first}T00:00:00Z`).getUTCDay();
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  const qs = serializeSearchState({ ...state, from: undefined, to: undefined });
  const prev = addDays(first, -1).slice(0, 7), next = addDays(last, 1).slice(0, 7);
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`));
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{label}</h1>
        <Link className="tap inline-flex items-center rounded-lg border border-line-strong px-3 no-underline" href={`/calendar?${qs}&month=${prev}`}>← Previous</Link>
        <Link className="tap inline-flex items-center rounded-lg border border-line-strong px-3 no-underline" href={`/calendar?${qs}&month=${next}`}>Next →</Link>
        <Link className="ml-auto" href={`/?${qs}`}>Back to list & map</Link>
      </div>
      <p className="mt-1 text-sm text-muted">{data.total} events this month with your filters.</p>
      <ol className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-7" aria-label={`Events in ${label}`}>
        {Array.from({ length: startDow }, (_, i) => <li key={`pad${i}`} aria-hidden="true" className="hidden bg-surface sm:block" />)}
        {days.map((d) => {
          const evs = data.results.filter((r) => r.startDate && r.startDate <= d && (r.endDate ?? r.startDate) >= d);
          return (
            <li key={d} className={`min-h-24 bg-bg p-2 ${evs.length ? "" : "hidden sm:block"}`}>
              <p className="text-xs font-semibold text-muted">{new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))}</p>
              <ul className="mt-1 flex flex-col gap-1">{evs.map((e) => <li key={e.id} className="text-xs"><Link href={`/events/${e.slug}`}>{e.isSynthetic ? "[DEMO] " : ""}{e.name}</Link></li>)}</ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
