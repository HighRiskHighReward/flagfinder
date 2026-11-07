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

export type { MapProviderKey } from "./map-config";
import { resolveMapConfig } from "./map-config";

/** Which embedded map providers are configured. No keys → "none" (list + directions links). */
export function mapConfig() { return resolveMapConfig(loadEnv()); }
