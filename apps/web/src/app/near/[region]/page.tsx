import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateRange, parseSearchState } from "@ff/core";
import { searchEvents } from "@ff/db";
import { db, showDemoData } from "@/lib/server";
import { DemoBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

async function region(slug: string) {
  return (await db().query(`SELECT slug, name FROM regions WHERE slug=$1 AND is_priority`, [slug])).rows[0] as { slug: string; name: string } | undefined;
}

export async function generateMetadata({ params }: { params: Promise<{ region: string }> }): Promise<Metadata> {
  const r = await region((await params).region);
  return r ? { title: `Flag football near ${r.name}`, alternates: { canonical: `/near/${r.slug}` } } : { title: "Not found" };
}

/** Curated, indexable city/region landing page (filter combinations elsewhere are noindex). */
export default async function NearPage({ params }: { params: Promise<{ region: string }> }) {
  const r = await region((await params).region);
  if (!r) notFound();
  const data = await searchEvents(db(), parseSearchState({ region: r.slug }), { showSynthetic: showDemoData() });
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold">Flag football tournaments and leagues near {r.name}</h1>
      <p className="mt-2 text-muted">{data.total} upcoming {data.total === 1 ? "event" : "events"} in our listings. <Link href={`/?region=${r.slug}`}>Filter by age, dates and distance on the map</Link>.</p>
      <ul className="mt-6 flex flex-col gap-3">
        {data.results.slice(0, 30).map((e) => (
          <li key={e.id} className="rounded-xl border border-line p-3">
            <Link href={`/events/${e.slug}`} className="font-semibold">{e.name}</Link> {e.isSynthetic && <DemoBadge />}
            <p className="text-sm">{formatDateRange(e.startDate, e.endDate, e.datePrecision)} · {e.venues[0]?.locality ?? "location not published"}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted">Coverage is still growing. <Link href="/coverage">See which sources we monitor</Link>, or <Link href="/submit">submit an event</Link>.</p>
    </div>
  );
}
