import { boundsOf, clusterPins, zoomFor } from "./cluster";
import type { MapHandlers, MapInstance, MapPin, MapProvider, Viewport } from "./types";

/**
 * TEST-ONLY renderer: draws pins/clusters as positioned buttons over a blank panel, with no
 * tiles or basemap. It exists so map/list sync can be tested end-to-end without provider keys.
 * Refused in production by env validation (packages/config/env.ts); labeled on screen.
 */
export const testDomProvider: MapProvider = {
  key: "test-dom",
  label: "Test renderer (no basemap)",
  attribution: "Test renderer — not a map. No basemap data.",
  acceptsLicense: () => true,
  async mount(el: HTMLElement, h: MapHandlers): Promise<MapInstance> {
    el.innerHTML = "";
    el.classList.add("testdom-map");
    const layer = document.createElement("div");
    layer.className = "testdom-layer";
    layer.setAttribute("data-testid", "map-layer");
    el.appendChild(layer);
    let pins: MapPin[] = [];
    let active: string | null = null;
    let v: Viewport = { west: -97.6, east: -96.4, south: 32.5, north: 33.4, zoom: zoomFor(1.2) };

    const render = () => {
      layer.innerHTML = "";
      const w = el.clientWidth || 600, hgt = el.clientHeight || 400;
      for (const item of clusterPins(pins, v)) {
        const x = ((item.lon - v.west) / (v.east - v.west)) * w;
        const y = ((v.north - item.lat) / (v.north - v.south)) * hgt;
        const b = document.createElement("button");
        b.type = "button";
        b.style.left = `${x}px`;
        b.style.top = `${y}px`;
        if (item.kind === "cluster") {
          b.className = "testdom-cluster";
          b.textContent = String(item.count);
          b.setAttribute("aria-label", `${item.count} events here. Zoom in.`);
          b.dataset.testid = "map-cluster";
          b.onclick = () => { const span = (v.east - v.west) / 3, latSpan = (v.north - v.south) / 3; v = { west: item.lon - span / 2, east: item.lon + span / 2, south: item.lat - latSpan / 2, north: item.lat + latSpan / 2, zoom: v.zoom + 1.6 }; render(); h.onViewportChange(v, true); };
        } else {
          b.className = `testdom-pin${item.pin.approximate ? " approx" : ""}${item.pin.eventId === active ? " active" : ""}`;
          b.dataset.testid = "map-pin";
          b.dataset.eventId = item.pin.eventId;
          b.setAttribute("aria-label", `${item.pin.label}${item.pin.approximate ? " (approximate location)" : ""}`);
          b.onclick = () => h.onPinSelect(item.pin.eventId);
          b.onmouseenter = () => h.onPinSelect(item.pin.eventId);
        }
        layer.appendChild(b);
      }
    };
    // Simple pan (drag) for "Search this area" tests.
    let drag: { x: number; y: number; v: Viewport } | null = null;
    el.addEventListener("pointerdown", (e) => { if ((e.target as HTMLElement).tagName === "BUTTON") return; drag = { x: e.clientX, y: e.clientY, v }; });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = ((e.clientX - drag.x) / (el.clientWidth || 600)) * (drag.v.east - drag.v.west);
      const dy = ((e.clientY - drag.y) / (el.clientHeight || 400)) * (drag.v.north - drag.v.south);
      v = { ...drag.v, west: drag.v.west - dx, east: drag.v.east - dx, north: drag.v.north + dy, south: drag.v.south + dy };
      render();
    });
    el.addEventListener("pointerup", () => { if (drag) { drag = null; h.onViewportChange(v, true); } });
    const zoom = (f: number) => { const cx = (v.west + v.east) / 2, cy = (v.south + v.north) / 2, sx = (v.east - v.west) * f / 2, sy = (v.north - v.south) * f / 2; v = { west: cx - sx, east: cx + sx, south: cy - sy, north: cy + sy, zoom: zoomFor(sx * 2) }; render(); h.onViewportChange(v, true); };
    const controls = document.createElement("div");
    controls.className = "testdom-controls";
    for (const [label, f] of [["Zoom in", 0.5], ["Zoom out", 2]] as const) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = label === "Zoom in" ? "+" : "−"; b.setAttribute("aria-label", label); b.onclick = () => zoom(f); controls.appendChild(b);
    }
    el.appendChild(controls);
    return {
      setPins(p) { pins = p; render(); },
      setActive(id) { active = id; render(); },
      fitTo(p) { const b = boundsOf(p); if (b) { v = b; render(); h.onViewportChange(v, false); } },
      destroy() { el.innerHTML = ""; },
    };
  },
};
