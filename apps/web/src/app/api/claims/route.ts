import { z } from "zod";
import { hitRateLimit, openReview } from "@ff/db";
import { db } from "@/lib/server";
import { currentUser } from "@/lib/auth-server";
import { clientKey, sameOrigin } from "@/lib/request";

/** Organizer claim request. Approval is a moderator decision with verification (email domain, website token, or manual). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad origin" }, { status: 403 });
  const u = await currentUser(req.headers);
  if (!u) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!(await hitRateLimit(db(), `claims:${clientKey(req)}`, 5, 3600)).allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  const p = z.object({ organizerId: z.string().uuid(), evidence: z.string().min(20).max(2000), method: z.enum(["email_domain", "website_token", "manual"]), eventIds: z.array(z.string().uuid()).max(50).default([]) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Describe how we can verify you run this organization (at least 20 characters)." }, { status: 400 });
  const r = await db().query(`INSERT INTO organizer_claims (organizer_id, user_id, evidence, verification_method, confirmed_event_ids) SELECT id, $2, $3, $4, $5 FROM organizers WHERE id=$1 AND NOT is_synthetic RETURNING id, verification_token`,
    [p.data.organizerId, u.id, p.data.evidence, p.data.method, p.data.eventIds]);
  if (!r.rowCount) return Response.json({ error: "Organization not found" }, { status: 404 });
  await openReview(db(), { kind: "claim", refId: r.rows[0].id, reason: `Organizer claim by ${u.email}` });
  return Response.json({ ok: true, verificationToken: p.data.method === "website_token" ? r.rows[0].verification_token : undefined });
}
