"use client";
import { useEffect, useRef, useState } from "react";
import { MapPinOff } from "lucide-react";
import type { MapInstance, MapPin, MapProvider, Viewport } from "@/map/types";

export interface MapClientConfig { available: string[]; default: string; googleKey?: string; googleMapId?: string }

async function loadProvider(key: string, cfg: MapClientConfig): Promise<MapProvider | null> {
  if (key === "test-dom") return (await import("@/map/test-dom")).testDomProvider;
  if (key === "google" && cfg.googleKey) return (await import("@/map/google")).googleProvider(cfg.googleKey, cfg.googleMapId);
  if (key === "apple") return (await import("@/map/apple")).appleProvider;
  return null;
}

/** Lazy-loaded map. Pins come from the same result set as the list (Invariant 5). */
export function MapPanel({ config, pins, activeId, onPinSelect, onUserMove, total, mappable, resultsKey, bbox }: {
  config: MapClientConfig; pins: MapPin[]; activeId: string | null; onPinSelect: (id: string) => void; onUserMove: (v: Viewport) => void;
  total: number; mappable: number; resultsKey: string; bbox?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<MapInstance | null>(null);
  const [provider, setProvider] = useState<MapProvider | null>(null);
  const [choice, setChoice] = useState(config.default);
  const [failed, setFailed] = useState<string | null>(null);
  const handlers = useRef({ onPinSelect, onUserMove });
  handlers.current = { onPinSelect, onUserMove };

  useEffect(() => {
    try { const saved = localStorage.getItem("ff-map"); if (saved && config.available.includes(saved)) setChoice(saved); } catch { /* ignore */ }
  }, [config.available]);

  useEffect(() => {
    if (choice === "none" || !el.current) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await loadProvider(choice, config);
        if (!p || cancelled || !el.current) return;
        inst.current?.destroy();
        inst.current = await p.mount(el.current, {
          onPinSelect: (id) => handlers.current.onPinSelect(id),
          onViewportChange: (v, user) => { if (user) handlers.current.onUserMove(v); },
        });
        setProvider(p);
        setFailed(null);
      } catch (e) {
        if (!cancelled) setFailed((e as Error).message || "Map failed to load");
      }
    })();
    return () => { cancelled = true; inst.current?.destroy(); inst.current = null; setProvider(null); };
  }, [choice, config]);

  const usable = provider ? pins.filter((p) => provider.acceptsLicense(p.geocodeLicense)) : [];
  useEffect(() => {
    if (!inst.current || !provider) return;
    inst.current.setPins(usable);
    inst.current.fitTo(usable);
  }, [provider, resultsKey, bbox, pins.length]);
  useEffect(() => { inst.current?.setActive(activeId); }, [activeId, provider]);

  if (choice === "none" || failed) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 bg-surface p-8 text-center" data-testid="map-unavailable">
        <MapPinOff aria-hidden="true" size={32} />
        <p className="max-w-sm font-semibold">{failed ? "The map couldn't load." : "An embedded map isn't configured."}</p>
        <p className="max-w-sm text-sm text-muted">All {total} results are in the list. Each event has “Open in Google Maps”, “Open in Apple Maps” and “Get directions” links. {mappable} of {total} have a mappable location.</p>
      </div>
    );
  }
  return (
    <div className="relative h-full min-h-[320px]">
      <div ref={el} className="h-full w-full" data-testid="map" data-provider={provider?.key ?? "loading"} data-pin-count={usable.length} role="application" aria-label={`Map of ${usable.length} event locations`} />
      {!provider && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">Loading map…</p>}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 rounded-md bg-bg/90 px-2 py-1 text-xs">
        <span>{provider?.attribution}</span>
        {provider?.key === "test-dom" && <span className="font-bold">TEST RENDERER</span>}
        {config.available.length > 1 && (
          <label className="flex items-center gap-1">Map
            <select className="rounded border border-line-strong bg-bg" value={choice} onChange={(e) => { setChoice(e.target.value); try { localStorage.setItem("ff-map", e.target.value); } catch { /* ignore */ } }}>
              {config.available.map((a) => <option key={a} value={a}>{a === "google" ? "Google" : a === "apple" ? "Apple" : a}</option>)}
            </select>
          </label>
        )}
      </div>
      {pins.length > usable.length && <p className="absolute right-2 top-2 rounded bg-bg/90 px-2 py-1 text-xs">{pins.length - usable.length} locations can&apos;t be shown on this map provider (licensing)</p>}
    </div>
  );
}
