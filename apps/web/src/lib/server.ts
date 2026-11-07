import "server-only";
import { loadEnv } from "@ff/config";
import { getPool } from "@ff/db";

export function db() { return getPool(loadEnv().DATABASE_URL); }

/** Demo data shows (with DEMO badge) outside production only. Never in production. */
export function showDemoData(): boolean {
  const env = loadEnv();
  if (env.appEnv === "production") return false;
  return process.env.SHOW_DEMO_DATA !== "off";
}

export type MapProviderKey = "google" | "apple" | "test-dom" | "none";

/** Which embedded map providers are configured. No keys → "none" (list + directions links). */
export function mapConfig(): { available: MapProviderKey[]; default: MapProviderKey; googleKey?: string; googleMapId?: string } {
  const env = loadEnv();
  const forced = env.NEXT_PUBLIC_MAP_PROVIDER;
  const available: MapProviderKey[] = [];
  if (env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) available.push("google");
  if (env.MAPKIT_TEAM_ID && env.MAPKIT_KEY_ID && env.MAPKIT_PRIVATE_KEY) available.push("apple");
  if (forced === "test-dom" && env.appEnv !== "production") return { available: ["test-dom"], default: "test-dom" };
  if (forced === "none") return { available: [], default: "none" };
  const def: MapProviderKey = forced === "google" || forced === "apple" ? (available.includes(forced) ? forced : available[0] ?? "none") : available[0] ?? "none";
  return { available, default: def, googleKey: env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, googleMapId: env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID };
}
