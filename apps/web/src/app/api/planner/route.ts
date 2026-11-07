import { z } from "zod";
import { db } from "@/lib/server";
import { currentUser } from "@/lib/auth-server";
import { sameOrigin } from "@/lib/request";

const body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), name: z.string().min(1).max(80) }),
  z.object({ op: z.literal("add"), planId: z.string().uuid(), eventId: z.string().uuid(), travelDaysBefore: z.number().int().min(0).max(7).default(0), travelDaysAfter: z.number().int().min(0).max(7).default(0) }),
  z.object({ op: z.literal("remove"), planId: z.string().uuid(), eventId: z.string().uuid() }),
]);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad origin" }, { status: 403 });
  const u = await currentUser(req.headers);
  if (!u) return Response.json({ error: "Sign in required" }, { status: 401 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const d = p.data;
  if (d.op === "create") return Response.json({ id: (await db().query(`INSERT INTO planner_plans (user_id, name) VALUES ($1,$2) RETURNING id`, [u.id, d.name])).rows[0].id });
  const own = await db().query(`SELECT 1 FROM planner_plans WHERE id=$1 AND user_id=$2`, [d.planId, u.id]);
  if (!own.rowCount) return Response.json({ error: "Not found" }, { status: 404 });
  if (d.op === "add") await db().query(`INSERT INTO planner_items (plan_id, event_id, travel_days_before, travel_days_after) SELECT $1, id, $3, $4 FROM events WHERE id=$2 AND publish_state='published' ON CONFLICT (plan_id, event_id) DO UPDATE SET travel_days_before=EXCLUDED.travel_days_before, travel_days_after=EXCLUDED.travel_days_after`, [d.planId, d.eventId, d.travelDaysBefore, d.travelDaysAfter]);
  else await db().query(`DELETE FROM planner_items WHERE plan_id=$1 AND event_id=$2`, [d.planId, d.eventId]);
  return Response.json({ ok: true });
}
