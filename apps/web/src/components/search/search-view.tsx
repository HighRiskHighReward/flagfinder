"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { List, Map as MapIcon, SlidersHorizontal, LocateFixed, Info } from "lucide-react";
import { CHIPS, PRESETS, serializeSearchState, type Chip, type SearchState, type Sort } from "@ff/core";
import type { SearchResponse } from "@ff/db";
import type { RegionOption } from "@/lib/regions";
import { ResultCard } from "./result-card";
import { MoreFilters } from "./more-filters";
import { MapPanel, type MapClientConfig } from "./map-panel";
import { EmptyState } from "./empty-state";
import { SaveSearchButton } from "./save-search";
import type { Viewport } from "@/map/types";

const CHIP_LABEL: Record<Chip, string> = { weekend: "This weekend", next30: "Next 30 days", girls: "Girls flag", youth: "Youth", closing: "Registration closing soon", leagues: "Nearby leagues" };
const SORT_LABEL: Record<Sort, string> = { soonest: "Soonest", nearest: "Nearest", price: "Lowest published price", closing: "Registration closing soon", discovered: "Recently discovered", updated: "Recently updated", best: "Best match" };

export function SearchView({ state, data, regions, map }: { state: SearchState; data: SearchResponse; regions: RegionOption[]; map: MapClientConfig }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [moreOpen, setMoreOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [movedViewport, setMovedViewport] = useState<Viewport | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [shown, setShown] = useState(25 * (state.page ?? 1));
  const [listWidth, setListWidth] = useState(46);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => { setShown(25 * (state.page ?? 1)); setMovedViewport(null); }, [state]);

  const navigate = useCallback((next: SearchState) => {
    const qs = serializeSearchState(next);
    startTransition(() => router.push(qs ? `/?${qs}` : "/", { scroll: false }));
  }, [router]);
  const update = useCallback((patch: Partial<SearchState>) => navigate({ ...state, ...patch, page: undefined }), [state, navigate]);

  const results = data.results;
  const visible = results.slice(0, shown);
  const unmapped = data.total - data.mappable;

  const selectFromMap = useCallback((eventId: string) => {
    setActiveId(eventId);
    const idx = results.findIndex((r) => r.id === eventId);
    if (idx >= shown) setShown(Math.ceil((idx + 1) / 25) * 25);
    requestAnimationFrame(() => {
      const el = document.getElementById(`card-${eventId}`);
      el?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  }, [results, shown]);

  const toggleChip = (c: Chip) => {
    const chips = state.chips.includes(c) ? state.chips.filter((x) => x !== c) : [...state.chips, c];
    update({ chips });
  };
  const useMyLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) { setGeoError("Location isn't available in this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => update({ lat: +pos.coords.latitude.toFixed(4), lon: +pos.coords.longitude.toFixed(4), region: undefined, postal: undefined, bbox: undefined, radius: state.radius ?? 25 }),
      () => setGeoError("We couldn't get your location. Choose a city instead."),
      { maximumAge: 300_000, timeout: 10_000 },
    );
  };
  const regionValue = state.lat !== undefined ? "__me" : state.bbox ? "__map" : state.region ?? "dfw";
  const dateValue = state.chips.includes("weekend") ? "weekend" : state.chips.includes("next30") ? "next30" : state.from || state.to ? "custom" : "upcoming";
  const countText = `${data.total} ${data.total === 1 ? "event" : "events"} · ${data.mappable} on map`;

  const onDividerKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setListWidth((w) => Math.max(28, w - 4));
    if (e.key === "ArrowRight") setListWidth((w) => Math.min(72, w + 4));
  };
  const onDividerDrag = (e: React.PointerEvent) => {
    const container = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const move = (ev: PointerEvent) => setListWidth(Math.min(72, Math.max(28, ((ev.clientX - container.left) / container.width) * 100)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const mapPins = useMemo(() => results.flatMap((r) => r.venues.filter((v) => v.lat !== null && v.lon !== null).map((v) => ({
    id: `${r.id}:${v.id}`, eventId: r.id, venueId: v.id, lat: v.lat!, lon: v.lon!, label: r.name, approximate: v.geoPrecision === "city", geocodeLicense: v.geocodeLicense,
  }))), [results]);

  return (
    <div className="mx-auto max-w-[1600px]">
      {/* ---------- primary filters (always visible) ---------- */}
      <section aria-label="Search filters" className="border-b border-line px-4 py-3">
        <h1 className="sr-only">Find events</h1>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:flex-wrap lg:items-end">
          <label className="flex flex-col gap-1 text-sm font-medium">Location
            <select data-testid="filter-location" className="tap rounded-lg border border-line-strong bg-bg px-3" value={regionValue}
              onChange={(e) => e.target.value === "__me" ? useMyLocation() : e.target.value === "__map" ? undefined : update({ region: e.target.value, lat: undefined, lon: undefined, bbox: undefined, postal: undefined })}>
              {state.lat !== undefined && <option value="__me">My location</option>}
              {state.bbox && <option value="__map">Map area</option>}
              {regions.filter((r) => r.kind !== "country" && r.kind !== "state").map((r) => <option key={r.slug} value={r.slug}>{r.kind === "city" ? r.name : `${r.name} (all)`}</option>)}
              <option value="tx">Texas</option>
              <option value="us">United States</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Dates
            <select data-testid="filter-dates" className="tap rounded-lg border border-line-strong bg-bg px-3" value={dateValue}
              onChange={(e) => {
                const v = e.target.value; const chips = state.chips.filter((c) => c !== "weekend" && c !== "next30");
                if (v === "weekend" || v === "next30") update({ chips: [...chips, v], from: undefined, to: undefined });
                else if (v === "next90") { const t = data.today; const d = new Date(`${t}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 90); update({ chips, from: t, to: d.toISOString().slice(0, 10) }); }
                else update({ chips, from: undefined, to: undefined });
              }}>
              <option value="upcoming">All upcoming</option>
              <option value="weekend">This weekend</option>
              <option value="next30">Next 30 days</option>
              <option value="next90">Next 90 days</option>
              {dateValue === "custom" && <option value="custom">{state.from ?? data.today} → {state.to ?? "any"}</option>}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1 text-sm font-medium">
            <legend className="mb-1">Ages</legend>
            <div className="flex items-center gap-1">
              <label className="sr-only" htmlFor="age-min">Youngest age</label>
              <select id="age-min" data-testid="filter-age-min" className="tap w-full rounded-lg border border-line-strong bg-bg px-2" value={state.ageMin ?? ""} onChange={(e) => update({ ageMin: e.target.value ? +e.target.value : undefined })}>
                <option value="">Any</option>{Array.from({ length: 16 }, (_, i) => i + 4).map((a) => <option key={a} value={a}>{a}</option>)}
                <option value="19">Adult</option>
              </select>
              <span aria-hidden="true">–</span>
              <label className="sr-only" htmlFor="age-max">Oldest age</label>
              <select id="age-max" data-testid="filter-age-max" className="tap w-full rounded-lg border border-line-strong bg-bg px-2" value={state.ageMax ?? ""} onChange={(e) => update({ ageMax: e.target.value ? +e.target.value : undefined })}>
                <option value="">Any</option>{Array.from({ length: 16 }, (_, i) => i + 4).map((a) => <option key={a} value={a}>{a}</option>)}
                <option value="99">Adult</option>
              </select>
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-medium">Distance
            <select data-testid="filter-distance" className="tap rounded-lg border border-line-strong bg-bg px-3" value={state.radius ?? ""} onChange={(e) => update({ radius: e.target.value ? +e.target.value : undefined })}>
              <option value="">Default for area</option>
              {[5, 10, 25, 50, 100, 250].map((r) => <option key={r} value={r}>Within {r} {state.unit ?? "mi"}</option>)}
            </select>
          </label>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-4 lg:col-span-1">
            <button type="button" onClick={useMyLocation} className="tap flex items-center gap-2 rounded-lg border border-line-strong px-3 text-sm hover:bg-surface">
              <LocateFixed aria-hidden="true" size={18} /> <span className="sm:hidden">Near me</span><span className="hidden sm:inline">Use my location</span>
            </button>
            <button type="button" onClick={() => setMoreOpen(true)} data-testid="more-filters" className="tap flex items-center gap-2 rounded-lg border border-line-strong px-3 text-sm hover:bg-surface">
              <SlidersHorizontal aria-hidden="true" size={18} /> More filters{activeFilterCount(state) ? ` (${activeFilterCount(state)})` : ""}
            </button>
          </div>
        </div>
        {geoError && <p role="alert" className="mt-2 text-sm text-danger">{geoError}</p>}
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Quick filters">
          {CHIPS.map((c) => (
            <button key={c} type="button" aria-pressed={state.chips.includes(c)} onClick={() => toggleChip(c)} data-testid={`chip-${c}`}
              className={`tap shrink-0 rounded-full border px-4 text-sm ${state.chips.includes(c) ? "border-primary bg-primary text-on-primary" : "border-line-strong hover:bg-surface"}`}>
              {CHIP_LABEL[c]}
            </button>
          ))}
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => navigate({ ...emptyState(), ...p.state } as SearchState)} className="tap shrink-0 rounded-full border border-dashed border-line-strong px-4 text-sm hover:bg-surface">
              Preset: {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* ---------- result header ---------- */}
      <div className="flex items-center gap-x-3 border-b border-line px-4 py-2">
        <p aria-live="polite" aria-atomic="true" data-testid="result-count" className="text-sm font-semibold">
          {pending ? "Updating results…" : countText}
          {!pending && unmapped > 0 && <span className="block font-normal text-muted sm:inline"> {unmapped} without a mappable location</span>}
          {data.truncated && <span className="font-normal text-warning"> · showing the first 500; narrow your search</span>}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <label className="sr-only text-sm sm:not-sr-only" htmlFor="sort">Sort</label>
          <select id="sort" data-testid="sort" className="tap rounded-lg border border-line-strong bg-bg px-2 text-sm" value={state.sort ?? "soonest"} onChange={(e) => update({ sort: e.target.value as Sort })}>
            {(Object.keys(SORT_LABEL) as Sort[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
          </select>
          <SaveSearchButton query={serializeSearchState(state)} />
          <a href={`/calendar?${serializeSearchState(state)}`} className="tap hidden items-center px-2 text-sm sm:inline-flex">Calendar view</a>
          {(state.sort === "best") && <button type="button" className="tap flex items-center gap-1 text-sm underline" onClick={() => setWhyOpen(true)}><Info size={16} aria-hidden="true" />Why this order?</button>}
        </div>
      </div>

      {/* ---------- mobile view toggle ---------- */}
      <div className="sticky top-14 z-30 flex border-b border-line bg-bg md:hidden" role="group" aria-label="View">
        {(["list", "map"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={mobileView === v} onClick={() => setMobileView(v)} data-testid={`view-${v}`}
            className={`tap flex flex-1 items-center justify-center gap-2 text-sm font-semibold ${mobileView === v ? "border-b-4 border-accent" : "text-muted"}`}>
            {v === "list" ? <List size={18} aria-hidden="true" /> : <MapIcon size={18} aria-hidden="true" />}{v === "list" ? "List" : "Map"}
          </button>
        ))}
      </div>

      {/* ---------- split layout ---------- */}
      <div className="md:flex md:h-[calc(100dvh-14rem)] md:min-h-[480px]" data-testid="split">
        <section aria-label="Results list" style={{ flexBasis: `${listWidth}%` }}
          className={`${mobileView === "map" ? "hidden md:block" : "block"} md:shrink-0 md:overflow-y-auto`} aria-busy={pending}>
          {data.total === 0 ? <EmptyState state={state} regionName={data.regionName} onApply={update} /> : (
            <>
              <ol ref={listRef} className="flex flex-col gap-3 p-4" data-testid="result-list">
                {visible.map((r) => (
                  <ResultCard key={r.id} r={r} active={activeId === r.id} onActivate={() => setActiveId(r.id)} />
                ))}
              </ol>
              {shown < results.length && (
                <div className="px-4 pb-6">
                  <button type="button" className="tap w-full rounded-lg border border-line-strong font-semibold hover:bg-surface"
                    onClick={() => { const p = Math.floor(shown / 25) + 1; setShown(p * 25); window.history.replaceState(null, "", `/?${serializeSearchState({ ...state, page: p })}`); }}>
                    Show more ({results.length - shown} more)
                  </button>
                </div>
              )}
              <p className="px-4 pb-6 text-xs text-muted">
                We check sources on a schedule, but organizers don&apos;t always publish changes promptly. Confirm details with the organizer. <a href="/coverage">See coverage and known gaps</a>.
              </p>
            </>
          )}
        </section>
        <div role="separator" aria-orientation="vertical" aria-label="Resize list and map" aria-valuenow={Math.round(listWidth)} aria-valuemin={28} aria-valuemax={72}
          tabIndex={0} onKeyDown={onDividerKey} onPointerDown={onDividerDrag}
          className="hidden w-2 cursor-col-resize bg-line hover:bg-accent md:block" />
        <section aria-label="Map" className={`${mobileView === "list" ? "hidden md:block" : "block"} relative h-[calc(100dvh-10rem)] md:h-auto md:flex-1`}>
          <MapPanel config={map} pins={mapPins} activeId={activeId} onPinSelect={selectFromMap} total={data.total} mappable={data.mappable}
            onUserMove={(v) => setMovedViewport(v)} resultsKey={serializeSearchState(state)} bbox={state.bbox} />
          {movedViewport && (
            <button type="button" data-testid="search-this-area" onClick={() => update({ bbox: [movedViewport.west, movedViewport.south, movedViewport.east, movedViewport.north].map((n) => n.toFixed(4)).join(","), region: undefined, lat: undefined, lon: undefined, postal: undefined })}
              className="tap absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-primary px-5 font-semibold text-on-primary shadow-lg">
              Search this area
            </button>
          )}
          {mobileView === "map" && <MobileSheet results={results} activeId={activeId} onActivate={setActiveId} count={countText} />}
        </section>
      </div>

      {moreOpen && <MoreFilters state={state} onClose={() => setMoreOpen(false)} onApply={(s) => { setMoreOpen(false); navigate(s); }} />}
      {whyOpen && <WhyThisOrder onClose={() => setWhyOpen(false)} />}
    </div>
  );
}

function MobileSheet({ results, activeId, onActivate, count }: { results: SearchResponse["results"]; activeId: string | null; onActivate: (id: string) => void; count: string }) {
  const [snap, setSnap] = useState<"peek" | "half" | "full">("peek");
  const heights = { peek: "6.5rem", half: "50%", full: "calc(100% - 1rem)" };
  const active = results.find((r) => r.id === activeId);
  useEffect(() => { if (activeId && snap === "peek") setSnap("half"); }, [activeId, snap]);
  return (
    <div className="sheet absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t border-line bg-bg shadow-2xl md:hidden" style={{ height: heights[snap], paddingBottom: "env(safe-area-inset-bottom)" }} data-testid="bottom-sheet" data-snap={snap}>
      <button type="button" className="tap flex w-full flex-col items-center gap-1 pt-2" aria-label={`Results sheet: ${snap}. Tap to expand.`}
        onClick={() => setSnap(snap === "peek" ? "half" : snap === "half" ? "full" : "peek")}>
        <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-line-strong" />
        <span className="text-sm font-semibold">{count}</span>
      </button>
      <ol className="flex-1 overflow-y-auto px-3 pb-3">
        {(active ? [active, ...results.filter((r) => r.id !== active.id)] : results).slice(0, 50).map((r) => (
          <ResultCard key={r.id} r={r} active={r.id === activeId} onActivate={() => onActivate(r.id)} compact idPrefix="sheet" />
        ))}
      </ol>
    </div>
  );
}

function WhyThisOrder({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto max-w-md rounded-2xl border border-line bg-bg p-6 text-fg backdrop:bg-black/50" aria-labelledby="why-title">
      <h2 id="why-title" className="text-xl font-bold">Why this order?</h2>
      <p className="mt-2 text-sm">“Best match” ranks results using only these factors:</p>
      <ul className="mt-2 list-disc pl-5 text-sm">
        <li><strong>Filter fit (35%)</strong>: definite eligibility matches rank above “possible” matches.</li>
        <li><strong>Distance (25%)</strong>: closer venues rank higher (straight-line distance).</li>
        <li><strong>Date proximity (20%)</strong>: sooner events rank higher.</li>
        <li><strong>Verification level (10%)</strong>: corroborated or confirmed details rank higher.</li>
        <li><strong>Freshness (10%)</strong>: recently checked sources rank higher.</li>
      </ul>
      <p className="mt-2 text-sm">No one pays for placement in these results.</p>
      <form method="dialog"><button className="tap mt-4 w-full rounded-lg bg-primary font-semibold text-on-primary">Close</button></form>
    </dialog>
  );
}

function emptyState(): SearchState {
  return { gender: [], level: [], type: [], format: [], comp: [], reg: [], basis: [], io: [], unk: [], chips: [] } as unknown as SearchState;
}

function activeFilterCount(s: SearchState): number {
  return [s.gender, s.level, s.type, s.format, s.comp, s.reg, s.basis, s.io].filter((a) => a.length).length
    + [s.feeMax, s.guarantee, s.organizer, s.verif, s.freshDays, s.postal, s.country, s.closingDays, s.q].filter((v) => v !== undefined && v !== "").length;
}
