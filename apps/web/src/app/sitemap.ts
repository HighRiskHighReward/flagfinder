import type { MetadataRoute } from "next";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Canonical event pages + curated region pages. Synthetic and long-expired events are excluded. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const grace = Number((await db().query(`SELECT value FROM app_settings WHERE key='sitemap_expired_grace_days'`)).rows[0]?.value ?? 30);
  const events = (await db().query(`SELECT slug, updated_at FROM events WHERE publish_state='published' AND NOT is_synthetic AND (end_date IS NULL OR end_date >= current_date - $1::int) ORDER BY start_date LIMIT 45000`, [grace])).rows;
  const regions = (await db().query(`SELECT slug FROM regions WHERE is_priority`)).rows;
  return [
    { url: `${base}/`, changeFrequency: "hourly" },
    { url: `${base}/coverage` },
    ...regions.map((r) => ({ url: `${base}/near/${r.slug}`, changeFrequency: "daily" as const })),
    ...events.map((e) => ({ url: `${base}/events/${e.slug}`, lastModified: e.updated_at })),
  ];
}
