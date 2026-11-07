"use client";
import type { SearchState } from "@ff/core";

export function EmptyState({ state, regionName, onApply }: { state: SearchState; regionName: string | null; onApply: (p: Partial<SearchState>) => void }) {
  const unit = state.unit ?? "mi";
  const suggestions: { label: string; patch: Partial<SearchState> }[] = [];
  const radius = state.radius ?? 25;
  if (radius < 100) suggestions.push({ label: `Try ${radius < 50 ? 50 : 100} ${unit}`, patch: { radius: radius < 50 ? 50 : 100 } });
  if (state.chips.includes("weekend") || state.chips.includes("next30") || state.to) suggestions.push({ label: "Next 90 days", patch: { chips: state.chips.filter((c) => c !== "weekend" && c !== "next30"), to: undefined } });
  if (state.gender.length || state.level.length || state.format.length) suggestions.push({ label: "Include unpublished details", patch: { unk: ["gender", "level", "format", "age", "fee", "comp"] } });
  if (state.bbox) suggestions.push({ label: "Search all of DFW", patch: { bbox: undefined, region: "dfw" } });
  const what = [state.gender.join("/"), state.ageMin !== undefined ? `${state.ageMin}–${state.ageMax ?? state.ageMin}` : ""].filter(Boolean).join(" ");
  return (
    <div className="p-8 text-center" data-testid="empty-state">
      <p className="text-lg font-semibold">No {what ? `${what} ` : ""}events found{regionName ? ` near ${regionName}` : ""}.</p>
      <p className="mt-1 text-sm text-muted">Coverage is still growing, so missing results may mean we don&apos;t monitor that organizer yet.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => <button key={s.label} type="button" onClick={() => onApply(s.patch)} className="tap rounded-full border border-line-strong px-4 text-sm hover:bg-surface">{s.label}</button>)}
        <a className="tap inline-flex items-center rounded-full border border-line-strong px-4 text-sm no-underline" href="/submit">Submit an event</a>
      </div>
    </div>
  );
}
