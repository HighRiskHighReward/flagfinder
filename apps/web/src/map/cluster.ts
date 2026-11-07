import Supercluster from "supercluster";
import type { MapPin, Viewport } from "./types";

export type ClusterItem =
  | { kind: "pin"; pin: MapPin; lat: number; lon: number }
  | { kind: "cluster"; id: number; count: number; lat: number; lon: number; eventIds: string[] };

/** Shared clustering so every provider groups markers identically. */
export function clusterPins(pins: MapPin[], v: Viewport): ClusterItem[] {
  const index = new Supercluster<{ pinIndex: number }>({ radius: 50, maxZoom: 16 });
  index.load(pins.map((p, i) => ({ type: "Feature", properties: { pinIndex: i }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })));
  return index.getClusters([v.west, v.south, v.east, v.north], Math.round(v.zoom)).map((f) => {
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const props = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; pinIndex?: number };
    if (props.cluster) {
      const leaves = index.getLeaves(props.cluster_id!, Infinity).map((l) => pins[l.properties.pinIndex]!.eventId);
      return { kind: "cluster", id: props.cluster_id!, count: props.point_count!, lat, lon, eventIds: [...new Set(leaves)] };
    }
    return { kind: "pin", pin: pins[props.pinIndex!]!, lat, lon };
  });
}

export function boundsOf(pins: MapPin[]): Viewport | null {
  if (!pins.length) return null;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const p of pins) { west = Math.min(west, p.lon); east = Math.max(east, p.lon); south = Math.min(south, p.lat); north = Math.max(north, p.lat); }
  const padLon = Math.max(0.02, (east - west) * 0.1), padLat = Math.max(0.02, (north - south) * 0.1);
  return { west: west - padLon, east: east + padLon, south: south - padLat, north: north + padLat, zoom: zoomFor(east - west + 2 * padLon) };
}

export function zoomFor(lonSpan: number): number {
  return Math.max(2, Math.min(16, Math.log2(360 / Math.max(lonSpan, 0.0001))));
}
