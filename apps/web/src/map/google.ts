import { clusterPins } from "./cluster";
import type { MapHandlers, MapInstance, MapPin, MapProvider, Viewport } from "./types";

/**
 * Google Maps JS adapter. Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (restrict by HTTP referrer
 * in Google Cloud console) and optionally NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID for Advanced Markers.
 * GAP: not exercised against a live key in this build (no key available). See LIMITATIONS.md.
 */
export function googleProvider(apiKey: string, mapId: string | undefined): MapProvider {
  return {
    key: "google",
    label: "Google Maps",
    attribution: "Map data © Google",
    // Apple-derived coordinates may not be displayed on Google maps (Invariant 10).
    acceptsLicense: (l) => l !== "apple",
    async mount(el: HTMLElement, h: MapHandlers): Promise<MapInstance> {
      const { setOptions, importLibrary } = await import("@googlemaps/js-api-loader");
      setOptions({ key: apiKey, v: "weekly" });
      const { Map } = (await importLibrary("maps")) as google.maps.MapsLibrary;
      const map = new Map(el, { center: { lat: 32.85, lng: -96.95 }, zoom: 9, mapId, clickableIcons: false, gestureHandling: "cooperative" });
      let markers: google.maps.Marker[] = [];
      let pins: MapPin[] = [];
      let active: string | null = null;
      let programmatic = false;
      const viewport = (): Viewport | null => {
        const b = map.getBounds(); if (!b) return null;
        const ne = b.getNorthEast(), sw = b.getSouthWest();
        return { west: sw.lng(), south: sw.lat(), east: ne.lng(), north: ne.lat(), zoom: map.getZoom() ?? 9 };
      };
      const render = () => {
        markers.forEach((m) => m.setMap(null));
        const v = viewport(); if (!v) return;
        markers = clusterPins(pins, v).map((item) => {
          if (item.kind === "cluster") {
            const m = new google.maps.Marker({ map, position: { lat: item.lat, lng: item.lon }, label: { text: String(item.count), color: "#FFFFFF" }, title: `${item.count} events` });
            m.addListener("click", () => { map.setZoom((map.getZoom() ?? 9) + 2); map.panTo({ lat: item.lat, lng: item.lon }); });
            return m;
          }
          const isActive = item.pin.eventId === active;
          const m = new google.maps.Marker({
            map, position: { lat: item.lat, lng: item.lon }, title: item.pin.approximate ? `${item.pin.label} (approximate location)` : item.pin.label,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: isActive ? 11 : 8, fillColor: item.pin.approximate ? "#FFFFFF" : "#0B5D3B", fillOpacity: 1, strokeColor: isActive ? "#D4AF37" : "#090D0B", strokeWeight: isActive ? 4 : 2 },
            zIndex: isActive ? 1000 : 1,
          });
          m.addListener("click", () => h.onPinSelect(item.pin.eventId));
          return m;
        });
      };
      map.addListener("idle", () => { render(); const v = viewport(); if (v) h.onViewportChange(v, !programmatic); programmatic = false; });
      return {
        setPins(p) { pins = p; render(); },
        setActive(id) { active = id; render(); },
        fitTo(p) {
          if (!p.length) return;
          const b = new google.maps.LatLngBounds(); p.forEach((x) => b.extend({ lat: x.lat, lng: x.lon }));
          programmatic = true; map.fitBounds(b, 40);
        },
        destroy() { markers.forEach((m) => m.setMap(null)); el.innerHTML = ""; },
      };
    },
  };
}
