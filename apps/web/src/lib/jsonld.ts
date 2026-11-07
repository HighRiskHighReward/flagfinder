import type { EventDetail } from "@ff/db";

/** schema.org Event JSON-LD. Never emitted for synthetic records (Invariant 2). Only published facts. */
export function eventJsonLd(e: EventDetail, url: string): string {
  const status: Record<string, string> = { scheduled: "https://schema.org/EventScheduled", cancelled: "https://schema.org/EventCancelled", postponed: "https://schema.org/EventPostponed" };
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org", "@type": "SportsEvent", name: e.name, url, sport: "Flag football",
    startDate: e.startAt ?? e.startDate ?? undefined, endDate: e.endAt ?? e.endDate ?? undefined,
    eventStatus: status[e.status], eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: e.venues.map((v) => ({ "@type": "Place", name: v.name, address: { "@type": "PostalAddress", streetAddress: v.addressLine1 ?? undefined, addressLocality: v.locality ?? undefined, addressRegion: v.adminArea ?? undefined, postalCode: v.postalCode ?? undefined, addressCountry: v.countryCode } })),
    organizer: e.organizer ? { "@type": "Organization", name: e.organizer.name, url: e.organizer.websiteUrl ?? undefined } : undefined,
    offers: e.divisions.filter((d) => d.feeStatus === "known").map((d) => ({ "@type": "Offer", name: d.name, price: (d.feeAmountMinor! / 100).toFixed(2), priceCurrency: d.feeCurrency, url: e.registrationUrl ?? undefined })),
  };
  // Escape "<" so scraped text can't close the script tag.
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
