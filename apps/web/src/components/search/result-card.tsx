"use client";
import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import type { SearchResult } from "@ff/db";
import { formatDateRange, feeLabel, REG_LABEL, TYPE_LABEL } from "@/lib/format";
import { DemoBadge, FreshnessText, StatusBadge, VerificationBadge } from "../badges";

export function ResultCard({ r, active, onActivate, compact, idPrefix = "card" }: { r: SearchResult; active: boolean; onActivate: () => void; compact?: boolean; idPrefix?: string }) {
  const v = r.venues[0];
  const place = v ? [v.name, v.locality, v.adminArea].filter(Boolean).join(", ") : "Location not published";
  const mappable = r.venues.some((x) => x.lat !== null);
  const approx = r.venues.some((x) => x.geoPrecision === "city");
  const closingSoon = r.registrationDeadline && r.registrationStatus !== "closed" && daysUntil(r.registrationDeadline) <= 14 && daysUntil(r.registrationDeadline) >= 0;
  return (
    <li id={`${idPrefix}-${r.id}`} data-testid={idPrefix === "card" ? "result-card" : "sheet-card"} data-event-id={r.id} data-mappable={mappable}
      onMouseEnter={onActivate} onFocus={onActivate}
      className={`list-none rounded-xl border bg-bg p-4 transition-shadow ${active ? "border-accent shadow-[0_0_0_2px_var(--c-accent)]" : "border-line"} ${compact ? "mt-2" : ""}`}
      data-active={active}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary-text">{TYPE_LABEL[r.eventType]}</span>
        {r.isSynthetic && <DemoBadge />}
        <StatusBadge status={r.status} />
        {r.ageMatch === "possible" && <span className="text-xs font-medium text-warning">Possible match: confirm eligibility with organizer</span>}
      </div>
      <h2 className="mt-1 text-lg font-bold leading-snug">
        <Link href={`/events/${r.slug}`} className="text-fg no-underline hover:underline">{r.name}</Link>
      </h2>
      <p className="mt-1 flex items-start gap-1.5 text-sm"><CalendarDays aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
        {formatDateRange(r.startDate, r.endDate, r.datePrecision)}{r.nextSessionStart && r.eventType === "league" ? ` · next session ${r.nextSessionStart}` : ""}
      </p>
      <p className="mt-0.5 flex items-start gap-1.5 text-sm"><MapPin aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
        <span>{place}{r.venues.length > 1 ? ` + ${r.venues.length - 1} more venue${r.venues.length > 2 ? "s" : ""}` : ""}
          {r.distanceLabel ? <span className="text-muted"> · {r.distanceLabel}</span> : null}
          {!mappable && <span className="text-muted"> · not on map</span>}
          {approx && <span className="text-muted"> · approximate location</span>}</span>
      </p>
      {!compact && (
        <>
          <p className="mt-2 text-sm">
            <span className="font-medium">{feeLabel(r.minFee, r.feeUnknown)}</span>
            <span className="text-muted"> · {REG_LABEL[r.registrationStatus]}</span>
            {closingSoon && <span className="ml-2 inline-flex rounded-md bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">Closes {r.registrationDeadline}</span>}
          </p>
          {r.divisionsSummary.length > 0 && <p className="mt-1 line-clamp-1 text-xs text-muted">Divisions: {r.divisionsSummary.join(" · ")}</p>}
        </>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <VerificationBadge level={r.verificationLevel} />
        <FreshnessText lastSuccessAt={r.lastSuccessAt} lastCheckedAt={r.lastCheckedAt} />
        <Link href={`/events/${r.slug}`} className="tap ml-auto inline-flex items-center rounded-lg px-2 text-sm font-semibold" aria-label={`View details: ${r.name}`}>View details</Link>
      </div>
    </li>
  );
}

function daysUntil(d: string) { return Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z")) / 86_400_000); }
