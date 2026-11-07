import { clusterPins } from "./cluster";
import type { MapHandlers, MapInstance, MapPin, MapProvider, Viewport } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { mapkit?: any } }

/**
 * Apple MapKit JS adapter. The JWT is signed server-side at /api/mapkit-token (never exposed
 * as a long-lived secret to the browser). GAP: not exercised against live credentials here.
 */
export const appleProvider: MapProvider = {
  key: "apple",
  label: "Apple Maps",
  attribution: "© Apple Maps",
  // Google-derived coordinates may not be shown on Apple maps (Invariant 10).
  acceptsLicense: (l) => l !== "google",
  async mount(el: HTMLElement, h: MapHandlers): Promise<MapInstance> {
    await loadScript("https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js");
    const mk = window.mapkit;
    mk.init({ authorizationCallback: (done: (t: string) => void) => { fetch("/api/mapkit-token").then((r) => r.text()).then(done); } });
    const map = new mk.Map(el, { showsPointsOfInterest: false });
    map.region = new mk.CoordinateRegion(new mk.Coordinate(32.85, -96.95), new mk.CoordinateSpan(1.2, 1.2));
    let pins: MapPin[] = [];
    let active: string | null = null;
    const viewport = (): Viewport => {
      const r = map.region; const c = r.center, s = r.span;
      return { west: c.longitude - s.longitudeDelta / 2, east: c.longitude + s.longitudeDelta / 2, south: c.latitude - s.latitudeDelta / 2, north: c.latitude + s.latitudeDelta / 2, zoom: Math.log2(360 / s.longitudeDelta) };
    };
    const render = () => {
      map.removeAnnotations(map.annotations);
      const anns = clusterPins(pins, viewport()).map((item) => {
        const coord = new mk.Coordinate(item.lat, item.lon);
        if (item.kind === "cluster") return new mk.MarkerAnnotation(coord, { glyphText: String(item.count), color: "#090D0B", title: `${item.count} events` });
        const a = new mk.MarkerAnnotation(coord, { title: item.pin.label, subtitle: item.pin.approximate ? "Approximate location" : undefined, color: item.pin.approximate ? "#6B7470" : item.pin.eventId === active ? "#D4AF37" : "#0B5D3B" });
        a.addEventListener("select", () => h.onPinSelect(item.pin.eventId));
        return a;
      });
      map.addAnnotations(anns);
    };
    map.addEventListener("region-change-end", () => { render(); h.onViewportChange(viewport(), true); });
    return {
      setPins(p) { pins = p; render(); },
      setActive(id) { active = id; render(); },
      fitTo(p) { if (p.length) { map.showItems(p.map((x) => new mk.MarkerAnnotation(new mk.Coordinate(x.lat, x.lon))), { padding: new mk.Padding(40, 40, 40, 40) }); } },
      destroy() { map.destroy(); },
    };
  },
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.mapkit) return resolve();
    const s = document.createElement("script");
    s.src = src; s.crossOrigin = "anonymous"; s.onload = () => resolve(); s.onerror = () => reject(new Error("MapKit failed to load"));
    document.head.appendChild(s);
  });
}
