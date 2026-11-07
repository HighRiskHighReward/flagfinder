import { z } from "zod";
import { db } from "@/lib/server";
import { currentUser } from "@/lib/auth-server";
import { sameOrigin } from "@/lib/request";

export async function GET(req: Request) {
  const u = await currentUser(req.headers);
  if (!u) return Response.json({ error: "Sign in required" }, { status: 401 });
  const r = await db().query(`SELECT e.id, e.slug, e.name, e.start_date, e.end_date FROM favorites f JOIN events e ON e.id=f.event_id WHERE f.user_id=$1 ORDER BY e.start_date`, [u.id]);
  return Response.json({ favorites: r.rows });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad origin" }, { status: 403 });
  const u = await currentUser(req.headers);
  if (!u) return Response.json({ error: "Sign in required" }, { status: 401 });
  const p = z.object({ eventId: z.string().uuid(), remove: z.boolean().optional() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (p.data.remove) await db().query(`DELETE FROM favorites WHERE user_id=$1 AND event_id=$2`, [u.id, p.data.eventId]);
  else {
    const r = await db().query(`INSERT INTO favorites (user_id, event_id) SELECT $1, id FROM events WHERE id=$2 AND publish_state='published' AND NOT is_synthetic ON CONFLICT DO NOTHING RETURNING event_id`, [u.id, p.data.eventId]);
    if (!r.rowCount) { const ex = await db().query(`SELECT 1 FROM favorites WHERE user_id=$1 AND event_id=$2`, [u.id, p.data.eventId]); if (!ex.rowCount) return Response.json({ error: "Event can't be saved" }, { status: 404 }); }
  }
  return Response.json({ ok: true });
}
