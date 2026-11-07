import { NextResponse } from "next/server";
import { parseSearchState } from "@ff/core";
import { searchEvents } from "@ff/db";
import { db, showDemoData } from "@/lib/server";

/** JSON search API. Same function as the page → identical results for map and list. */
export async function GET(req: Request) {
  const state = parseSearchState(new URL(req.url).searchParams);
  const data = await searchEvents(db(), state, { showSynthetic: showDemoData() });
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
