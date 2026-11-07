import { z } from "zod";
import { hitRateLimit, openReview } from "@ff/db";
import { db } from "@/lib/server";
import { clientKey, sameOrigin } from "@/lib/request";
import { currentUser } from "@/lib/auth-server";

const body = z.object({
  eventId: z.string().uuid(), field: z.string().min(1).max(60), message: z.string().min(10).max(2000),
  evidenceUrl: z.string().url().max(500).regex(/^https?:\/\//).nullable().optional(), website: z.string().max(0).optional().nullable(),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad origin" }, { status: 403 });
  const rl = await hitRateLimit(db(), `corrections:${clientKey(req)}`, 5, 3600);
  if (!rl.allowed) return Response.json({ error: "Too many reports. Try again later." }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Please describe the problem in at least 10 characters." }, { status: 400 });
  if (parsed.data.website) return Response.json({ ok: true }); // honeypot: silently drop bots
  const user = await currentUser(req.headers);
  const r = await db().query(`INSERT INTO corrections (event_id, field, message, evidence_url, reporter_user_id) SELECT id,$2,$3,$4,$5 FROM events WHERE id=$1 RETURNING id`,
    [parsed.data.eventId, parsed.data.field, parsed.data.message, parsed.data.evidenceUrl ?? null, user?.id ?? null]);
  if (!r.rows[0]) return Response.json({ error: "Event not found" }, { status: 404 });
  await openReview(db(), { kind: "correction", eventId: parsed.data.eventId, refId: r.rows[0].id, reason: `Reported: ${parsed.data.field}` });
  return Response.json({ ok: true });
}
