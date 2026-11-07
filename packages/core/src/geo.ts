export interface LatLon { lat: number; lon: number }

export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const KM_PER_MI = 1.609344;
export type DistanceUnit = "mi" | "km";

export function defaultUnitForLocale(locale: string): DistanceUnit {
  const region = locale.split("-")[1]?.toUpperCase();
  return region === "US" || region === "GB" || region === "LR" || region === "MM" ? "mi" : "km";
}

export function toKm(value: number, unit: DistanceUnit): number { return unit === "mi" ? value * KM_PER_MI : value; }

export function formatDistance(km: number, unit: DistanceUnit): string {
  const v = unit === "mi" ? km / KM_PER_MI : km;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${unit} (straight-line distance)`;
}

/** Deep links that work with no embedded map and no API key. */
export function directionsLinks(dest: { lat?: number | null; lon?: number | null; address?: string | null; name?: string | null }) {
  const q = dest.lat != null && dest.lon != null ? `${dest.lat},${dest.lon}` : [dest.name, dest.address].filter(Boolean).join(", ");
  const enc = encodeURIComponent(q);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${enc}`,
    apple: `https://maps.apple.com/?q=${encodeURIComponent(dest.name ?? q)}${dest.lat != null && dest.lon != null ? `&ll=${dest.lat},${dest.lon}` : `&address=${enc}`}`,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${enc}`,
  };
}
