import { db } from "@/lib/server";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response("Invalid link", { status: 400 });
  const r = await db().query(`UPDATE alert_preferences SET confirmed_at=COALESCE(confirmed_at, now()) WHERE confirm_token=$1 RETURNING user_id`, [token]);
  return Response.redirect(new URL(r.rowCount ? "/account?alerts=confirmed" : "/account?alerts=invalid", req.url), 303);
}
