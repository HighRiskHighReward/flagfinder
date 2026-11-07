import { brand } from "@ff/config/brand";
import { buildIcs } from "@ff/core";
import { getEventBySlug } from "@ff/db";
import { db, showDemoData } from "@/lib/server";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const e = await getEventBySlug(db(), (await params).slug);
  if (!e || (e.isSynthetic && !showDemoData())) return new Response("Not found", { status: 404 });
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const v = e.venues[0];
  const body = buildIcs([{ uid: `${e.id}@${brand.domain}`, name: e.isSynthetic ? `[DEMO] ${e.name}` : e.name, url: `${base}/events/${e.slug}`, startDate: e.startDate, endDate: e.endDate, startAt: e.startAt, endAt: e.endAt, location: v ? [v.name, v.locality, v.adminArea].filter(Boolean).join(", ") : null, description: null, status: e.status, datePrecision: e.datePrecision }], brand.name);
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${e.slug}.ics"` } });
}
