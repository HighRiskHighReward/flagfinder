import type { Metadata } from "next";
import Link from "next/link";
import { formatDateRange } from "@ff/core";
import { getEventBySlug } from "@ff/db";
import { db, showDemoData } from "@/lib/server";
import { REG_LABEL } from "@/lib/format";
import { divisionEligibility, divisionFee } from "@/lib/event-format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Compare events", robots: { index: false } };

/** Compare up to 3 events side by side; unknowns are shown as unknown. */
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const ids = ((await searchParams).ids ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 3);
  const slugs = ids.length ? (await db().query(`SELECT slug FROM events WHERE id = ANY($1) AND publish_state='published'`, [ids])).rows.map((r) => r.slug as string) : [];
  const events = (await Promise.all(slugs.map((s) => getEventBySlug(db(), s)))).filter((e): e is NonNullable<typeof e> => !!e && (!e.isSynthetic || showDemoData()));
  const rows: [string, (e: (typeof events)[number]) => React.ReactNode][] = [
    ["When", (e) => formatDateRange(e.startDate, e.endDate, e.datePrecision)],
    ["Where", (e) => e.venues[0] ? `${e.venues[0].name}${e.venues[0].locality ? `, ${e.venues[0].locality}` : ""}` : "Not published"],
    ["Divisions & eligibility", (e) => e.divisions.length ? e.divisions.map((d) => <div key={d.id}>{d.name}: {divisionEligibility(d)}</div>) : "Not published"],
    ["Cost", (e) => e.divisions.length ? e.divisions.map((d) => <div key={d.id}>{d.name}: {divisionFee(d)}</div>) : "Price not published"],
    ["Game guarantee", (e) => e.divisions.some((d) => d.gameGuarantee != null) ? e.divisions.map((d) => <div key={d.id}>{d.name}: {d.gameGuarantee ?? "not published"}</div>) : "Not published"],
    ["Registration", (e) => `${REG_LABEL[e.registrationStatus]}${e.registrationDeadline ? ` · deadline ${e.registrationDeadline}` : ""}`],
    ["Status", (e) => e.status],
    ["Verification", (e) => e.verificationLevel.replace(/_/g, " ")],
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold">Compare events</h1>
      {events.length === 0 ? <p className="mt-2">Add events to compare from their event pages (up to 3).</p> : (
        <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Comparison table">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr><th className="w-40" scope="col"><span className="sr-only">Detail</span></th>{events.map((e) => <th key={e.id} scope="col" className="p-2 align-bottom"><Link href={`/events/${e.slug}`}>{e.isSynthetic ? "[DEMO] " : ""}{e.name}</Link><Link className="ml-2 text-xs font-normal" href={`/compare?ids=${ids.filter((x) => x !== e.id).join(",")}`}>remove</Link></th>)}</tr></thead>
            <tbody>{rows.map(([label, f]) => <tr key={label} className="border-t border-line align-top"><th scope="row" className="p-2">{label}</th>{events.map((e) => <td key={e.id} className="p-2">{f(e)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
