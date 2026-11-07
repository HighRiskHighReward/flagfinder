import { loadEnv } from "@ff/config";
import { signMapkitToken } from "@ff/providers/mapkit";

/** Short-lived MapKit JS token, signed server-side and bound to our origin. */
export async function GET() {
  const env = loadEnv();
  if (!env.MAPKIT_TEAM_ID || !env.MAPKIT_KEY_ID || !env.MAPKIT_PRIVATE_KEY) return new Response("MapKit not configured", { status: 404 });
  const token = await signMapkitToken({ teamId: env.MAPKIT_TEAM_ID, keyId: env.MAPKIT_KEY_ID, privateKey: env.MAPKIT_PRIVATE_KEY, origin: new URL(env.APP_BASE_URL).origin });
  return new Response(token, { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
