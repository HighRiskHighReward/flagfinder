import { db } from "@/lib/server";

/** One-click unsubscribe (GET from the email link, POST for List-Unsubscribe-Post). No sign-in needed. */
async function unsubscribe(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response("Invalid link", { status: 400 });
  await db().query(`UPDATE alert_preferences SET unsubscribed_at=now() WHERE unsubscribe_token=$1`, [token]);
  return new Response("<!doctype html><title>Unsubscribed</title><p>You're unsubscribed from alerts. You can turn them back on from your account.</p>", { headers: { "content-type": "text/html; charset=utf-8" } });
}
export const GET = unsubscribe;
export const POST = unsubscribe;
