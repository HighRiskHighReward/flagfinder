/**
 * Freshness state machine (Invariant 3).
 * - last_checked_at: we tried.
 * - last_success_at: fetched AND parsed successfully. Only success advances it.
 * - source_updated_at: what the source reports, if anything.
 * - last_material_change_at: a material field changed. Only a material change advances it.
 */
export interface Freshness {
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  sourceUpdatedAt: Date | null;
  lastMaterialChangeAt: Date | null;
}

export type FetchOutcome =
  | { kind: "success"; at: Date; sourceUpdatedAt?: Date | null; materialChange: boolean }
  | { kind: "not_modified"; at: Date } // HTTP 304: source confirmed unchanged → counts as a successful check
  | { kind: "failure"; at: Date; error: string }
  | { kind: "parse_failure"; at: Date; error: string }
  | { kind: "missing"; at: Date; httpStatus: number };

export function applyOutcome(f: Freshness, o: FetchOutcome): Freshness {
  const next: Freshness = { ...f, lastCheckedAt: o.at };
  if (o.kind === "success") {
    next.lastSuccessAt = o.at;
    if (o.sourceUpdatedAt) next.sourceUpdatedAt = o.sourceUpdatedAt;
    if (o.materialChange) next.lastMaterialChangeAt = o.at;
  } else if (o.kind === "not_modified") {
    next.lastSuccessAt = o.at;
  }
  // failure / parse_failure / missing: nothing but last_checked_at moves.
  return next;
}

export function relativeAge(from: Date | string | null, now = new Date()): string {
  if (!from) return "never";
  const t = typeof from === "string" ? new Date(from) : from;
  const mins = Math.round((now.getTime() - t.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function cadenceLabel(minutes: number): string {
  if (minutes < 60) return `Checked every ${minutes} min per source limits`;
  const h = minutes / 60;
  return `Checked every ${Number.isInteger(h) ? h : h.toFixed(1)}h per source limits`;
}

export const ORGANIZER_PUBLISH_DISCLAIMER =
  "We check sources on a schedule, but organizers don't always publish changes promptly. Confirm details with the organizer before you register or travel.";
