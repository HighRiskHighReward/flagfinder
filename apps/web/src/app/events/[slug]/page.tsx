import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, MapPin, Ticket, Users, ShieldCheck, Clock, ExternalLink, Navigation, History, Flag } from "lucide-react";
import { brand } from "@ff/config/brand";
import { cadenceLabel, directionsLinks, formatDateRange, googleCalendarLink, ORGANIZER_PUBLISH_DISCLAIMER, outlookCalendarLink, relativeAge, VERIFICATION_EXPLANATIONS, type VerificationLevel } from "@ff/core";
import { getEventBySlug } from "@ff/db";
import { db, showDemoData } from "@/lib/server";
import { DemoBadge, StatusBadge } from "@/components/badges";
import { REG_LABEL, TYPE_LABEL } from "@/lib/format";
import { divisionEligibility, divisionFee, GENDER_LABEL, LEVEL_LABEL, UNKNOWN, venueAddress } from "@/lib/event-format";
import { ShareButton } from "@/components/event/share-button";
import { SaveButton } from "@/components/event/save-button";
import { ReportForm } from "@/components/event/report-form";
import { eventJsonLd } from "@/lib/jsonld";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const e = await getEventBySlug(db(), slug);
  if (!e || (e.isSynthetic && !showDemoData())) return null;
  return e;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const e = await load((await params).slug);
  if (!e) return { title: "Event not found" };
  return {
    title: e.name,
    description: `${formatDateRange(e.startDate, e.endDate, e.datePrecision)} · ${e.venues[0]?.locality ?? ""}`,
    alternates: { canonical: `/events/${e.slug}` },
    robots: e.isSynthetic ? { index: false, follow: false } : undefined,
  };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const e = await load((await params).slug);
  if (!e) notFound();
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const url = `${base}/events/${e.slug}`;
  const v0 = e.venues[0];
  const ics = { uid: `${e.id}@${brand.domain}`, name: e.name, url, startDate: e.startDate, endDate: e.endDate, startAt: e.startAt, endAt: e.endAt, location: v0 ? `${v0.name}, ${venueAddress(v0)}` : null, description: null, status: e.status, datePrecision: e.datePrecision };
  const gcal = googleCalendarLink(ics), ocal = outlookCalendarLink(ics);
  const v = VERIFICATION_EXPLANATIONS[e.verificationLevel as VerificationLevel];
  const cadence = Math.min(...e.sources.map((s) => s.refreshCadenceMinutes), Infinity);
  const today = new Date().toISOString().slice(0, 10);
  const past = e.endDate ? e.endDate < today : e.startDate ? e.startDate < today : false;
  const fees = [...new Set(e.divisions.map(divisionFee))];
  const timeText = e.timeKnown && e.startAt ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: e.timezone, timeZoneName: "short" }).format(new Date(e.startAt)) : null;

  return (
    <article className="mx-auto max-w-3xl px-4 pb-16 pt-4">
      {!e.isSynthetic && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: eventJsonLd(e, url) }} />}
      <nav aria-label="Breadcrumb" className="text-sm"><Link href="/">← Back to results</Link></nav>
      {past && <p role="status" className="mt-3 rounded-lg border border-warning p-3 text-sm font-semibold text-warning">This event has ended ({formatDateRange(e.startDate, e.endDate, e.datePrecision)}). It is kept here for reference.</p>}
      {e.isSynthetic && <p className="mt-3 rounded-lg bg-demo-bg p-3 text-sm text-demo-text"><strong>DEMO DATA.</strong> This is a synthetic record for development and testing. It is not a real event.</p>}
      <header className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-text">{TYPE_LABEL[e.eventType]}</span>
          {e.isSynthetic && <DemoBadge />}
          <StatusBadge status={e.status} />
        </div>
        <h1 className="mt-1 text-3xl font-bold leading-tight tracking-tight">{e.name}</h1>
        {e.organizer && <p className="mt-1 text-muted">By {e.organizer.name}</p>}
        {e.statusEvidence && (e.status === "cancelled" || e.status === "postponed") && <p className="mt-2 text-sm text-danger">Published notice: “{e.statusEvidence}”</p>}
        {e.status === "source_missing" && <p className="mt-2 text-sm text-danger">We couldn&apos;t find this listing at its source on the last check. That doesn&apos;t mean it&apos;s cancelled — confirm with the organizer.</p>}
      </header>

      {/* ---------- above the fold: the seven answers ---------- */}
      <dl className="mt-5 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2" data-testid="key-facts">
        <Fact icon={<CalendarDays size={18} />} label="When">{formatDateRange(e.startDate, e.endDate, e.datePrecision)}{timeText ? ` · starts ${timeText}` : " · start time not published"}</Fact>
        <Fact icon={<MapPin size={18} />} label="Where">{v0 ? <>{v0.name}<span className="block text-sm text-muted">{venueAddress(v0) || "Address not published"}{v0.geoPrecision === "city" ? " · approximate location" : ""}</span></> : "Location not published"}{e.venues.length > 1 && <span className="block text-sm text-muted">+ {e.venues.length - 1} more venue(s) below</span>}</Fact>
        <Fact icon={<Users size={18} />} label="Who can play">{e.divisions.length ? e.divisions.map((d) => d.name).join(" · ") : "Divisions not published"}</Fact>
        <Fact icon={<Ticket size={18} />} label="Cost">{fees.length ? fees.join(" · ") : "Price not published"}</Fact>
        <Fact icon={<Flag size={18} />} label="Registration">{REG_LABEL[e.registrationStatus]}{e.registrationDeadline ? ` · deadline ${e.registrationDeadline}` : " · deadline not published"}</Fact>
        <Fact icon={<Clock size={18} />} label="Last checked">{e.lastSuccessAt ? `${relativeAge(e.lastSuccessAt)} (successfully)` : "Not yet checked successfully"}{e.lastCheckedAt && e.lastSuccessAt && e.lastCheckedAt > e.lastSuccessAt ? <span className="block text-sm text-warning">Latest attempt {relativeAge(e.lastCheckedAt)} failed</span> : null}</Fact>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {e.registrationUrl ? (
          <a href={e.registrationUrl} target="_blank" rel="noopener noreferrer nofollow" className="tap inline-flex items-center gap-2 rounded-lg bg-primary px-5 font-semibold text-on-primary no-underline hover:bg-primary-hover" data-testid="view-registration">
            View registration <ExternalLink size={16} aria-hidden="true" /><span className="sr-only">(opens organizer site)</span>
          </a>
        ) : <span className="tap inline-flex items-center rounded-lg border border-line-strong px-4 text-sm">Registration link not published</span>}
        <SaveButton eventId={e.id} disabled={e.isSynthetic} />
        <ShareButton url={url} title={e.name} />
      </div>
      <p className="mt-2 text-xs text-muted">Registration happens on the organizer&apos;s or platform&apos;s site. {brand.name} doesn&apos;t handle registration or payments.</p>

      <Section title="Divisions and eligibility" id="divisions">
        {e.divisions.length === 0 ? <p>The organizer hasn&apos;t published divisions yet.</p> : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Divisions table (scrolls sideways)">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Divisions</caption>
              <thead><tr className="border-b border-line"><th className="py-2 pr-3">Division</th><th className="pr-3">Eligibility (as published)</th><th className="pr-3">Format</th><th className="pr-3">Level</th><th className="pr-3">Fee</th><th>Games</th></tr></thead>
              <tbody>
                {e.divisions.map((d) => (
                  <tr key={d.id} className="border-b border-line align-top">
                    <td className="py-2 pr-3 font-medium">{d.name}<span className="block text-xs text-muted">{GENDER_LABEL[d.genderCategory]}{d.genderLabelOriginal && d.genderLabelOriginal !== GENDER_LABEL[d.genderCategory] ? ` (“${d.genderLabelOriginal}”)` : ""} · {LEVEL_LABEL[d.levelCategory]}</span></td>
                    <td className="pr-3">{divisionEligibility(d)}{d.ageCutoffDate && <span className="block text-xs text-muted">Age is determined as of {d.ageCutoffDate}, not game day.</span>}{d.ageRuleType === "unknown" && <span className="block text-xs text-warning">Confirm eligibility with organizer</span>}</td>
                    <td className="pr-3">{d.format === "unknown" ? UNKNOWN : d.format}{d.contactClassification ? ` · ${d.contactClassification}` : ""}</td>
                    <td className="pr-3">{d.competitionLevel === "unknown" ? UNKNOWN : d.competitionLevel}</td>
                    <td className="pr-3">{divisionFee(d)}{d.extraFees.map((f) => <span key={f.label} className="block text-xs">+ {f.label}: {(f.amountMinor / 100).toFixed(2)} {f.currency}{f.mandatory ? " (required)" : ""}</span>)}</td>
                    <td>{d.gameGuarantee != null ? `${d.gameGuarantee} guaranteed` : UNKNOWN}{d.rulebookUrl && <a className="block text-xs" href={d.rulebookUrl} rel="noopener noreferrer nofollow" target="_blank">Rulebook</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">Capacity: {e.divisions.some((d) => d.capacityStatus === "known") ? e.divisions.filter((d) => d.capacityStatus === "known").map((d) => `${d.name}: ${d.capacityTeams} teams`).join(" · ") : "not published (we never assume spots are available)"}.</p>
      </Section>

      {e.sessions.length > 0 && (
        <Section title="League schedule" id="sessions">
          <ul className="list-disc pl-5 text-sm">{e.sessions.map((s) => <li key={s.name + s.startDate}>{s.name}: {formatDateRange(s.startDate, s.endDate, "day")}{s.gameDays.length ? ` · games on ${s.gameDays.join(", ")}` : ""}{s.practiceSchedule ? ` · practice: ${s.practiceSchedule}` : ""}</li>)}</ul>
        </Section>
      )}

      <Section title="Directions" id="directions">
        <ul className="flex flex-col gap-3">
          {e.venues.length === 0 && <li className="text-sm">No venue published.</li>}
          {e.venues.map((ven) => {
            const l = directionsLinks({ lat: ven.lat, lon: ven.lon, name: ven.name, address: venueAddress(ven) });
            return (
              <li key={ven.id} className="rounded-xl border border-line p-3" data-testid="venue">
                <p className="font-medium">{ven.name}{ven.geoPrecision === "city" && <span className="ml-2 rounded border border-line-strong px-1.5 text-xs">Approximate location</span>}</p>
                <p className="text-sm text-muted">{venueAddress(ven) || "Address not published"} · {ven.indoorOutdoor === "unknown" ? "indoor/outdoor not published" : ven.indoorOutdoor}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <a className="tap inline-flex items-center gap-1 rounded-lg border border-line-strong px-3 no-underline" href={l.google} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
                  <a className="tap inline-flex items-center gap-1 rounded-lg border border-line-strong px-3 no-underline" href={l.apple} target="_blank" rel="noopener noreferrer">Open in Apple Maps</a>
                  <a className="tap inline-flex items-center gap-1 rounded-lg bg-primary px-3 font-semibold text-on-primary no-underline" href={l.directions} target="_blank" rel="noopener noreferrer"><Navigation size={16} aria-hidden="true" />Get directions</a>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Add to calendar" id="calendar">
        {e.datePrecision === "tbd" || !e.startDate ? <p className="text-sm">Dates haven&apos;t been published yet.</p> : (
          <div className="flex flex-wrap gap-2 text-sm">
            <a className="tap inline-flex items-center rounded-lg border border-line-strong px-3 no-underline" href={`/events/${e.slug}/ics`} download>Download .ics</a>
            {gcal && <a className="tap inline-flex items-center rounded-lg border border-line-strong px-3 no-underline" href={gcal} target="_blank" rel="noopener noreferrer">Google Calendar</a>}
            {ocal && <a className="tap inline-flex items-center rounded-lg border border-line-strong px-3 no-underline" href={ocal} target="_blank" rel="noopener noreferrer">Outlook</a>}
            <Link className="tap inline-flex items-center rounded-lg border border-line-strong px-3 no-underline" href={`/compare?ids=${e.id}`}>Compare</Link>
          </div>
        )}
      </Section>

      <Section title="Sources and freshness" id="sources">
        <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={18} aria-hidden="true" />{v.label}</p>
        <details className="mt-1 text-sm"><summary className="cursor-pointer underline">What does “{v.label}” mean?</summary><p className="mt-1">{v.meaning}</p></details>
        <ul className="mt-3 flex flex-col gap-2 text-sm" data-testid="source-links">
          {e.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.sourceName}</a>
              <span className="text-muted"> · last seen {relativeAge(s.lastSeenAt)} · {cadenceLabel(s.refreshCadenceMinutes)}{s.recordStatus === "missing" ? " · listing not found on last check" : ""}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
          <div><dt className="font-semibold">Last attempt</dt><dd>{e.lastCheckedAt ? relativeAge(e.lastCheckedAt) : "never"}</dd></div>
          <div><dt className="font-semibold">Last successful check</dt><dd>{e.lastSuccessAt ? relativeAge(e.lastSuccessAt) : "never"}</dd></div>
          <div><dt className="font-semibold">Source&apos;s own update time</dt><dd>{e.sourceUpdatedAt ? relativeAge(e.sourceUpdatedAt) : "not reported by source"}</dd></div>
          <div><dt className="font-semibold">Last meaningful change</dt><dd>{e.lastMaterialChangeAt ? relativeAge(e.lastMaterialChangeAt) : "none recorded"}</dd></div>
        </dl>
        {Number.isFinite(cadence) && <p className="mt-2 text-xs text-muted">{cadenceLabel(cadence)}. {ORGANIZER_PUBLISH_DISCLAIMER}</p>}
        {e.openConflicts.length > 0 && <p className="mt-2 text-sm text-warning">Sources disagree on: {e.openConflicts.map((c) => c.field).join(", ")}. A moderator is reviewing.</p>}
      </Section>

      <Section title="Update history" id="history">
        {e.changes.length === 0 ? <p className="text-sm">No changes recorded since we first found this event ({relativeAge(e.discoveredAt)}).</p> : (
          <ol className="flex flex-col gap-2 text-sm">
            {e.changes.map((c, i) => (
              <li key={i} className="flex gap-2"><History size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span><strong>{c.field.replace(/_/g, " ")}</strong> changed {relativeAge(c.detectedAt)}{c.sourceName ? ` (per ${c.sourceName})` : ""}{c.material ? "" : " · minor"}</span></li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Report incorrect info" id="report">
        <ReportForm eventId={e.id} />
      </Section>
    </article>
  );
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr] gap-x-3">
      <dt className="contents"><span aria-hidden="true" className="row-span-2 mt-0.5 text-primary-text">{icon}</span><span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span></dt>
      <dd className="col-start-2 font-medium">{children}</dd>
    </div>
  );
}

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return <section aria-labelledby={`${id}-h`} className="mt-8"><h2 id={`${id}-h`} className="mb-3 text-xl font-bold">{title}</h2>{children}</section>;
}
