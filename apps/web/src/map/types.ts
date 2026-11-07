/** Provider-neutral map contract. Filtering/selection/results are identical across providers; only rendering differs. */
export interface MapPin {
  id: string;            // `${eventId}:${venueId}`
  eventId: string;
  venueId: string;
  lat: number;
  lon: number;
  label: string;
  approximate: boolean;  // city-level → distinct "Approximate location" style
  geocodeLicense: string | null;
}
export interface Viewport { west: number; south: number; east: number; north: number; zoom: number }

export interface MapHandlers {
  onPinSelect(eventId: string): void;
  onViewportChange(v: Viewport, userInitiated: boolean): void;
}

export interface MapInstance {
  setPins(pins: MapPin[]): void;
  setActive(eventId: string | null): void;
  fitTo(pins: MapPin[]): void;
  destroy(): void;
}

export interface MapProvider {
  key: "google" | "apple" | "test-dom";
  label: string;
  /** License classes whose coordinates this provider may render (Invariant 10). */
  acceptsLicense(license: string | null): boolean;
  attribution: string;
  mount(el: HTMLElement, handlers: MapHandlers): Promise<MapInstance>;
}
