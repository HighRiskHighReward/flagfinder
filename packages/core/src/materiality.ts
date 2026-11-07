import { createHash } from "node:crypto";

/** Fields whose change is "material" (alerts users, advances last_material_change_at). */
export const MATERIAL_FIELDS = [
  "name", "start_date", "end_date", "start_at", "timezone", "status", "venues",
  "registration_url", "registration_deadline", "registration_status", "divisions", "fees",
] as const;

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

export function normalizeText(s: string | null | undefined): string {
  return (s ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Normalized content hash over material fields only (cosmetic changes don't count). */
export function materialHash(snapshot: Record<string, unknown>): string {
  const picked: Record<string, unknown> = {};
  for (const f of MATERIAL_FIELDS) {
    const v = snapshot[f];
    picked[f] = typeof v === "string" ? normalizeText(v) : v ?? null;
  }
  return sha256(stableStringify(picked));
}

export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  material: boolean;
}

export function diffSnapshots(prev: Record<string, unknown>, next: Record<string, unknown>): FieldChange[] {
  const fields = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const out: FieldChange[] = [];
  for (const f of [...fields].sort()) {
    const a = prev[f] ?? null, b = next[f] ?? null;
    const same = typeof a === "string" && typeof b === "string" ? normalizeText(a) === normalizeText(b) : stableStringify(a) === stableStringify(b);
    if (!same) out.push({ field: f, oldValue: a, newValue: b, material: (MATERIAL_FIELDS as readonly string[]).includes(f) });
  }
  return out;
}
