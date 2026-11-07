import { addDays } from "./dates";

export interface PlannerItem { eventId: string; name: string; startDate: string | null; endDate: string | null; travelDaysBefore: number; travelDaysAfter: number }
export interface PlannerConflict { a: string; b: string; kind: "date_overlap" | "travel_overlap"; detail: string }

/** Date conflicts between planned events, including travel days on either side. Unknown dates can't conflict but are flagged. */
export function plannerConflicts(items: PlannerItem[]): { conflicts: PlannerConflict[]; undated: string[] } {
  const conflicts: PlannerConflict[] = [];
  const dated = items.filter((i) => i.startDate);
  for (let x = 0; x < dated.length; x++) for (let y = x + 1; y < dated.length; y++) {
    const a = dated[x]!, b = dated[y]!;
    const aS = a.startDate!, aE = a.endDate ?? aS, bS = b.startDate!, bE = b.endDate ?? bS;
    if (aS <= bE && bS <= aE) { conflicts.push({ a: a.eventId, b: b.eventId, kind: "date_overlap", detail: `${a.name} and ${b.name} overlap on game days` }); continue; }
    const aTS = addDays(aS, -a.travelDaysBefore), aTE = addDays(aE, a.travelDaysAfter), bTS = addDays(bS, -b.travelDaysBefore), bTE = addDays(bE, b.travelDaysAfter);
    if (aTS <= bTE && bTS <= aTE) conflicts.push({ a: a.eventId, b: b.eventId, kind: "travel_overlap", detail: `Travel days for ${a.name} and ${b.name} overlap` });
  }
  return { conflicts, undated: items.filter((i) => !i.startDate).map((i) => i.eventId) };
}
