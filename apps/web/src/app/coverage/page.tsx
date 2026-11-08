import type { Metadata } from "next";
import { cadenceLabel, relativeAge } from "@ff/core";
import { getCoverage } from "@ff/db";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Coverage and known gaps" };

const STATUS: Record<string, string> = { enabled: "Monitored", pending_credentials: "Waiting for credentials", pending_permission: "Waiting for permission", blocked: "Not used (access not permitted)", unsupported: "Not supported" };

export default async function CoveragePage() {
  const c = await getCoverage(db());
  const enabled = c.sources.filter((s) => s.status === "enabled" && !s.paused);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold">Coverage and known gaps</h1>
      <p className="mt-2 text-muted">Everything on this page is computed from our live database. Demo data is excluded. We don&apos;t publish uptime or freshness promises we haven&apos;t measured.</p>
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="coverage-counts">
        <Stat label="Upcoming real events" value={c.counts.upcoming} />
        <Stat label="Sources monitored" value={enabled.length} />
        <Stat label="Sources not yet usable" value={c.sources.length - enabled.length} />
        <Stat label="Open source-health issues" value={c.openHealthIssues} />
      </dl>

      <h2 className="mt-10 text-xl font-bold">Regions</h2>
      <table className="mt-3 w-full text-left text-sm">
        <thead><tr className="border-b border-line"><th className="py-2">Region</th><th>Upcoming real events</th></tr></thead>
        <tbody>{c.regions.map((r) => <tr key={r.slug} className="border-b border-line"><td className="py-2">{r.name}</td><td>{r.upcoming}</td></tr>)}</tbody>
      </table>

      <h2 className="mt-10 text-xl font-bold">Sources</h2>
      <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Sources table (scrolls sideways)">
        <table className="w-full min-w-[640px] text-left text-sm" data-testid="coverage-sources">
          <thead><tr className="border-b border-line"><th className="py-2">Source</th><th>Status</th><th>Method</th><th>Last successful check</th><th>Schedule</th></tr></thead>
          <tbody>
            {c.sources.map((s) => (
              <tr key={s.key} className="border-b border-line align-top">
                <td className="py-2"><a href={s.url} rel="noopener noreferrer nofollow" target="_blank">{s.name}</a></td>
                <td>{s.paused ? "Paused" : STATUS[s.status]}<span className="block text-xs text-muted">{s.status_reason}</span>{s.consecutive_failures > 0 && <span className="block text-xs text-warning">{s.consecutive_failures} consecutive failed checks</span>}</td>
                <td>{s.access_method}</td>
                <td>{s.last_success_at ? relativeAge(s.last_success_at) : "never"}</td>
                <td>{s.status === "enabled" ? cadenceLabel(s.refresh_cadence_minutes) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-bold">Known gaps</h2>
      <ul className="mt-3 list-disc pl-5 text-sm">
        <li>Many DFW programs publish only on registration platforms or social media that don&apos;t permit automated access. We list them only when organizers submit them or grant access.</li>
        <li>Facebook groups can&apos;t be monitored (Meta removed the Groups API in 2024). Facebook Pages need Meta app approval that we don&apos;t have yet.</li>
        <li>Checking a source on a schedule doesn&apos;t mean the organizer has published changes. Always confirm with the organizer.</li>
        {c.sources.filter((s) => s.status !== "enabled").map((s) => <li key={s.key}>{s.name}: {s.status_reason}</li>)}
      </ul>
      <p className="mt-6 text-sm">Run a program that isn&apos;t listed? <a href="/submit">Submit an event</a> or <a href="/organizers">claim your organization</a>.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-line p-3"><dt className="text-xs text-muted">{label}</dt><dd className="text-2xl font-bold">{value}</dd></div>;
}
