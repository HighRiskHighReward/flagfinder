import { z } from "zod";
import { parseSearchState, serializeSearchState } from "@ff/core";
import { db } from "@/lib/server";
import { currentUser } from "@/lib/auth-server";
import { sameOrigin } from "@/lib/request";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad origin" }, { status: 403 });
  const u = await currentUser(req.headers);
  if (!u) return Response.json({ error: "Sign in required" }, { status: 401 });
  const p = z.object({ name: z.string().min(1).max(80), query: z.string().max(2000), remove: z.string().uuid().optional() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (p.data.remove) { await db().query(`DELETE FROM saved_searches WHERE id=$1 AND user_id=$2`, [p.data.remove, u.id]); return Response.json({ ok: true }); }
  const canonical = serializeSearchState(parseSearchState(new URLSearchParams(p.data.query)));
  const n = (await db().query(`SELECT count(*)::int n FROM saved_searches WHERE user_id=$1`, [u.id])).rows[0].n;
  if (n >= 20) return Response.json({ error: "You can save up to 20 searches." }, { status: 400 });
  await db().query(`INSERT INTO saved_searches (user_id, name, query, last_run_at) VALUES ($1,$2,$3,now())`, [u.id, p.data.name, canonical]);
  return Response.json({ ok: true });
}
