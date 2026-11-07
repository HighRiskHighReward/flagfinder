import { hourOffsetSeconds } from "@ff/core";

export interface PlannableSource { id: string; priority_bucket: "dfw" | "us" | "intl"; refresh_cadence_minutes: number }
export interface PlannedJob { sourceId: string; window: string; startAfterSeconds: number; priority: number }

/**
 * Which sources are due this tick. Each source's slot is offset deterministically within its
 * cadence (hash(source_id) mod 3600s, scaled), plus 0–60 s jitter. The window key identifies
 * the cadence period so a source runs at most once per window. The DB-stored bucket weights
 * (default 60% DFW / 25% US / 15% international) cap how many runs each bucket gets per hour.
 */
export function planDue(sources: PlannableSource[], now: Date, opts: { tickSeconds: number; weights: Record<string, number>; hourlyCapacity: number; runsLastHour: Record<string, number>; rand?: () => number }): PlannedJob[] {
  const rand = opts.rand ?? Math.random;
  const nowS = Math.floor(now.getTime() / 1000);
  const remaining: Record<string, number> = {};
  for (const b of ["dfw", "us", "intl"]) remaining[b] = Math.floor(opts.hourlyCapacity * (opts.weights[b] ?? 0)) - (opts.runsLastHour[b] ?? 0);
  const due: PlannedJob[] = [];
  const ordered = [...sources].sort((a, b) => (opts.weights[b.priority_bucket] ?? 0) - (opts.weights[a.priority_bucket] ?? 0));
  for (const s of ordered) {
    const period = s.refresh_cadence_minutes * 60;
    const offset = Math.floor((hourOffsetSeconds(s.id) / 3600) * period);
    const windowIndex = Math.floor((nowS - offset) / period);
    const slotStart = windowIndex * period + offset;
    if (nowS - slotStart >= opts.tickSeconds) continue; // slot started earlier than this tick → already planned
    if ((remaining[s.priority_bucket] ?? 0) <= 0) continue;
    remaining[s.priority_bucket]!--;
    due.push({ sourceId: s.id, window: `${s.refresh_cadence_minutes}m:${windowIndex}`, startAfterSeconds: Math.floor(rand() * 60), priority: Math.round((opts.weights[s.priority_bucket] ?? 0) * 100) });
  }
  return due;
}
