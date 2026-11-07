import type { Metadata } from "next";
import { parseSearchState, serializeSearchState } from "@ff/core";
import { searchEvents } from "@ff/db";
import { db, mapConfig, showDemoData } from "@/lib/server";
import { SearchView } from "@/components/search/search-view";
import { loadRegions } from "@/lib/regions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const qs = serializeSearchState(parseSearchState(await searchParams));
  // Filter combinations are not indexable; the canonical is the default search.
  return { title: "Find flag football tournaments & leagues", alternates: { canonical: "/" }, robots: qs ? { index: false, follow: true } : undefined };
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = parseSearchState(await searchParams);
  const [data, regions] = await Promise.all([searchEvents(db(), state, { showSynthetic: showDemoData() }), loadRegions()]);
  const mc = mapConfig();
  return (
    <SearchView
      state={state}
      data={JSON.parse(JSON.stringify(data))}
      regions={regions}
      map={{ available: mc.available, default: mc.default, googleKey: mc.googleKey, googleMapId: mc.googleMapId }}
    />
  );
}
