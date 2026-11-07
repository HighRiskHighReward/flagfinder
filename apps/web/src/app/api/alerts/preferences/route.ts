import { randomBytes } from "node:crypto";
import { z } from "zod";
import { loadEnv } from "@ff/config";
import { brand } from "@ff/config/brand";
import { createEmailTransport } from "@ff/providers/email";
import { db } from "@/lib/server";
import { currentUser } from "@/lib/auth-server";
import { sameOrigin } from "@/lib/request";

/** Set alert frequency. First opt-in sends a confirmation email (double opt-in). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad origin" }, { status: 403 });
  const u = await currentUser(req.headers);
  if (!u) return Response.json({ error: "Sign in required" }, { status: 401 });
  const p = z.object({ frequency: z.enum(["instant", "daily", "weekly", "off"]) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const token = randomBytes(24).toString("hex");
  const r = await db().query(
    `INSERT INTO alert_preferences (user_id, frequency, confirm_token) VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE SET frequency=EXCLUDED.frequency, unsubscribed_at=NULL,
       confirm_token = CASE WHEN alert_preferences.confirmed_at IS NULL THEN EXCLUDED.confirm_token ELSE alert_preferences.confirm_token END
     RETURNING confirmed_at, confirm_token`, [u.id, p.data.frequency, token]);
  const pref = r.rows[0];
  if (!pref.confirmed_at && p.data.frequency !== "off") {
    const env = loadEnv();
    await createEmailTransport(env, db()).send({ to: u.email, subject: `Confirm ${brand.name} alerts`, text: `Confirm you want email alerts about saved events and searches:\n\n${env.APP_BASE_URL}/api/alerts/confirm?token=${pref.confirm_token}\n\nIf you didn't ask for this, ignore this email.` });
    return Response.json({ ok: true, confirmationSent: true });
  }
  return Response.json({ ok: true, confirmationSent: false });
}
