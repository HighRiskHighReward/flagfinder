"use client";
import { useEffect, useRef, useState } from "react";
import type { SearchState, Unknowable } from "@ff/core";

type ArrKey = "gender" | "level" | "type" | "format" | "comp" | "reg" | "basis" | "io";
const GROUPS: { key: ArrKey; label: string; unk?: Unknowable; options: [string, string][] }[] = [
  { key: "gender", label: "Gender category", unk: "gender", options: [["girls", "Girls"], ["boys", "Boys"], ["coed", "Coed"], ["womens", "Women's"], ["mens", "Men's"], ["other", "Other"]] },
  { key: "level", label: "Level", unk: "level", options: [["youth", "Youth"], ["high_school", "High school"], ["collegiate", "Collegiate"], ["adult", "Adult"]] },
  { key: "type", label: "Tournament or league", options: [["tournament", "Tournament"], ["league", "League"], ["clinic", "Clinic"], ["combine", "Combine"], ["other", "Other"]] },
  { key: "format", label: "Format", unk: "format", options: [["5v5", "5v5"], ["6v6", "6v6"], ["7v7", "7v7"], ["other", "Other"]] },
  { key: "comp", label: "Competition level", unk: "comp", options: [["recreational", "Recreational"], ["competitive", "Competitive"], ["elite", "Elite"]] },
  { key: "reg", label: "Registration status", unk: "reg", options: [["open", "Open"], ["not_yet_open", "Not yet open"], ["waitlist", "Waitlist"], ["closed", "Closed"]] },
  { key: "basis", label: "Pricing basis", unk: "fee", options: [["per_team", "Per team"], ["per_player", "Per player"], ["per_family", "Per family"]] },
  { key: "io", label: "Indoor / outdoor", unk: "io", options: [["outdoor", "Outdoor"], ["indoor", "Indoor"], ["both", "Both"]] },
];

export function MoreFilters({ state, onClose, onApply }: { state: SearchState; onClose: () => void; onApply: (s: SearchState) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [s, setS] = useState<SearchState>(state);
  useEffect(() => { ref.current?.showModal(); }, []);
  const toggle = (k: ArrKey, v: string) => setS((p) => {
    const cur = p[k] as string[];
    return { ...p, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
  });
  const toggleUnk = (u: Unknowable) => setS((p) => ({ ...p, unk: p.unk.includes(u) ? p.unk.filter((x) => x !== u) : [...p.unk, u] }));
  const num = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="mf-title" data-testid="more-filters-dialog"
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-lg overflow-y-auto border-l border-line bg-bg p-0 text-fg backdrop:bg-black/50 sm:rounded-l-2xl">
      <form onSubmit={(e) => { e.preventDefault(); onApply({ ...s, page: undefined }); }} className="flex min-h-full flex-col">
        <div className="sticky top-0 z-10 flex items-center border-b border-line bg-bg px-5 py-3">
          <h2 id="mf-title" className="text-xl font-bold">More filters</h2>
          <button type="button" onClick={onClose} className="tap ml-auto rounded-md px-3 text-sm underline">Cancel</button>
        </div>
        <div className="flex flex-col gap-6 px-5 py-4">
          <p className="text-sm text-muted">“Unknown / not published” includes events where the organizer hasn&apos;t published that detail. It&apos;s never included unless you tick it.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">Keyword
              <input className="tap rounded-lg border border-line-strong bg-bg px-3" value={s.q ?? ""} onChange={(e) => setS({ ...s, q: e.target.value || undefined })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Postal code
              <input className="tap rounded-lg border border-line-strong bg-bg px-3" value={s.postal ?? ""} autoComplete="postal-code" onChange={(e) => setS({ ...s, postal: e.target.value || undefined, region: e.target.value ? undefined : s.region })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Country (ISO code)
              <input className="tap rounded-lg border border-line-strong bg-bg px-3 uppercase" maxLength={2} value={s.country ?? ""} onChange={(e) => setS({ ...s, country: e.target.value.toUpperCase() || undefined })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Scope
              <select className="tap rounded-lg border border-line-strong bg-bg px-2" value={s.scope ?? "region"} onChange={(e) => setS({ ...s, scope: e.target.value === "region" ? undefined : (e.target.value as "national") })}>
                <option value="region">Selected area</option><option value="national">National</option><option value="international">International</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Distance unit
              <select className="tap rounded-lg border border-line-strong bg-bg px-2" value={s.unit ?? "mi"} onChange={(e) => setS({ ...s, unit: e.target.value as "mi" | "km" })}>
                <option value="mi">Miles</option><option value="km">Kilometers</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">From date
              <input type="date" className="tap rounded-lg border border-line-strong bg-bg px-2" value={s.from ?? ""} onChange={(e) => setS({ ...s, from: e.target.value || undefined, chips: s.chips.filter((c) => c !== "weekend" && c !== "next30") })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">To date
              <input type="date" className="tap rounded-lg border border-line-strong bg-bg px-2" value={s.to ?? ""} onChange={(e) => setS({ ...s, to: e.target.value || undefined, chips: s.chips.filter((c) => c !== "weekend" && c !== "next30") })} />
            </label>
          </div>
          {GROUPS.map((g) => (
            <fieldset key={g.key}>
              <legend className="mb-2 font-semibold">{g.label}</legend>
              <div className="flex flex-wrap gap-2">
                {g.options.map(([v, label]) => (
                  <label key={v} className={`tap inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${(s[g.key] as string[]).includes(v) ? "border-primary bg-surface font-semibold" : "border-line-strong"}`}>
                    <input type="checkbox" className="h-4 w-4 accent-[var(--c-primary)]" checked={(s[g.key] as string[]).includes(v)} onChange={() => toggle(g.key, v)} />{label}
                  </label>
                ))}
                {g.unk && (
                  <label className={`tap inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed px-3 text-sm ${s.unk.includes(g.unk) ? "border-primary font-semibold" : "border-line-strong"}`}>
                    <input type="checkbox" className="h-4 w-4" checked={s.unk.includes(g.unk)} onChange={() => toggleUnk(g.unk!)} />Unknown / not published
                  </label>
                )}
              </div>
            </fieldset>
          ))}
          <fieldset>
            <legend className="mb-2 font-semibold">Ages</legend>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={s.unk.includes("age")} onChange={() => toggleUnk("age")} />Include divisions whose ages are unknown / not published</label>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">Max fee
              <input type="number" min={0} inputMode="numeric" className="tap rounded-lg border border-line-strong bg-bg px-3" value={s.feeMax !== undefined ? s.feeMax / 100 : ""} onChange={(e) => setS({ ...s, feeMax: e.target.value === "" ? undefined : Math.round(Number(e.target.value) * 100) })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Currency
              <select className="tap rounded-lg border border-line-strong bg-bg px-2" value={s.currency ?? "USD"} onChange={(e) => setS({ ...s, currency: e.target.value })}>
                {["USD", "CAD", "MXN", "EUR", "GBP", "AUD", "JPY"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={s.unk.includes("fee")} onChange={() => toggleUnk("fee")} />Include unpublished prices</label>
            <span />
            <label className="flex flex-col gap-1 text-sm font-medium">Minimum game guarantee
              <select className="tap rounded-lg border border-line-strong bg-bg px-2" value={s.guarantee ?? ""} onChange={(e) => setS({ ...s, guarantee: num(e.target.value) })}>
                <option value="">Any</option>{[2, 3, 4, 5, 6, 8].map((g) => <option key={g} value={g}>{g}+ games</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Registration deadline within
              <select className="tap rounded-lg border border-line-strong bg-bg px-2" value={s.closingDays ?? ""} onChange={(e) => setS({ ...s, closingDays: num(e.target.value) })}>
                <option value="">Any</option>{[7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Verification
              <select className="tap rounded-lg border border-line-strong bg-bg px-2" value={s.verif ?? ""} onChange={(e) => setS({ ...s, verif: (e.target.value || undefined) as SearchState["verif"] })}>
                <option value="">Any</option><option value="source_checked">Source checked or better</option><option value="multi_source_corroborated">Corroborated or better</option><option value="organizer_confirmed">Organizer confirmed or better</option><option value="admin_verified">Verified by staff</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Freshness
              <select className="tap rounded-lg border border-line-strong bg-bg px-2" value={s.freshDays ?? ""} onChange={(e) => setS({ ...s, freshDays: num(e.target.value) })}>
                <option value="">Any</option><option value="1">Checked in last 24 h</option><option value="7">Checked in last 7 days</option><option value="30">Checked in last 30 days</option>
              </select>
            </label>
          </div>
        </div>
        <div className="sticky bottom-0 mt-auto flex gap-2 border-t border-line bg-bg px-5 py-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <button type="button" className="tap flex-1 rounded-lg border border-line-strong font-semibold" onClick={() => setS({ ...state, gender: [], level: [], type: [], format: [], comp: [], reg: [], basis: [], io: [], unk: [], feeMax: undefined, guarantee: undefined, verif: undefined, freshDays: undefined, closingDays: undefined, q: undefined, postal: undefined, country: undefined, scope: undefined })}>Clear</button>
          <button type="submit" data-testid="apply-filters" className="tap flex-1 rounded-lg bg-primary font-semibold text-on-primary hover:bg-primary-hover">Find events</button>
        </div>
      </form>
    </dialog>
  );
}
