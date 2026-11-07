import "server-only";
import { db } from "./server";

export interface RegionOption { slug: string; name: string; kind: string; parent: string | null }

export async function loadRegions(): Promise<RegionOption[]> {
  const r = await db().query(`SELECT r.slug, r.name, r.kind, p.slug AS parent FROM regions r LEFT JOIN regions p ON p.id=r.parent_id ORDER BY r.sort_order, r.name`);
  return r.rows;
}
