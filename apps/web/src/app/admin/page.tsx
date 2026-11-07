import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, unauthorized } from "next/navigation";
import { relativeAge } from "@ff/core";
import { db } from "@/lib/server";
import { currentUser, hasRole } from "@/lib/auth-server";
import { AdminAction } from "@/components/admin-action";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) unauthorized();
  if (!hasRole(user, "moderator")) forbidden();
  const isAdmin = hasRole(user, "admin");
  const q = (sql: string, p: unknown[] = []) => db().query(sql, p).then((r) => r.rows);
  const [sources, runs, deadLetters, reviews, dedups, merges, conflicts, claims, corrections, budget, auditTail, beats, queueDepth, submissions] = await Promise.all([
    q(`SELECT * FROM sources WHERE NOT is_synthetic ORDER BY priority_bucket, status, name`),
    q(`SELECT r.*, s.key FROM ingestion_runs r LEFT JOIN sources s ON s.id=r.source_id ORDER BY started_at DESC LIMIT 25`),
    q(`SELECT * FROM dead_letters WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 50`),
    q(`SELECT ri.*, e.name AS event_name, e.slug, e.publish_state FROM review_items ri LEFT JOIN events e ON e.id=ri.event_id WHERE ri.status='open' ORDER BY ri.created_at DESC LIMIT 200`),
    q(`SELECT d.*, a.name AS a_name, a.slug AS a_slug, b.name AS b_name, b.slug AS b_slug FROM dedup_candidates d JOIN events a ON a.id=d.event_a JOIN events b ON b.id=d.event_b WHERE d.status='pending' ORDER BY d.score DESC LIMIT 50`),
    q(`SELECT m.*, s.name AS s_name, x.name AS m_name FROM merges m JOIN events s ON s.id=m.survivor_id JOIN events x ON x.id=m.merged_id ORDER BY m.created_at DESC LIMIT 20`),
    q(`SELECT c.*, e.name, e.slug FROM conflicts c JOIN events e ON e.id=c.event_id WHERE c.status='open' LIMIT 50`),
    q(`SELECT oc.*, o.name AS org, u.email FROM organizer_claims oc JOIN organizers o ON o.id=oc.organizer_id JOIN "user" u ON u.id=oc.user_id WHERE oc.status='pending'`),
    q(`SELECT c.*, e.name, e.slug FROM corrections c JOIN events e ON e.id=c.event_id WHERE c.status='open' ORDER BY c.created_at DESC LIMIT 50`),
    q(`SELECT bucket, weight::float8 AS weight FROM crawl_budget ORDER BY bucket`),
    q(`SELECT * FROM audit_log ORDER BY id DESC LIMIT 25`),
    q(`SELECT * FROM scheduler_heartbeats`),
    q(`SELECT name, state, count(*)::int AS n FROM pgboss.job GROUP BY 1,2 ORDER BY 1,2`).catch(() => [] as Record<string, unknown>[]),
    q(`SELECT s.*, e.slug FROM submissions s LEFT JOIN events e ON e.id=s.event_id WHERE s.status IN ('received','fetching','awaiting_verification','in_review') ORDER BY s.created_at DESC LIMIT 50`),
  ]);
  const byKind = reviews.reduce<Record<string, typeof reviews>>((acc, r) => { (acc[r.kind] ??= []).push(r); return acc; }, {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 text-sm">
      <h1 className="text-2xl font-bold">Admin</h1>
      <p className="text-muted">Signed in as {user.email} ({user.role}). Every action below is recorded in the audit log.</p>
      <nav aria-label="Admin sections" className="mt-3 flex flex-wrap gap-3">
        {["health", "queue", "review", "submissions", "dedup", "conflicts", "claims", "corrections", "sources", "budget", "audit"].map((s) => <a key={s} href={`#${s}`}>{s}</a>)}
      </nav>

      <Section id="health" title="Process health">
        <ul>{beats.map((b) => <li key={b.process}>{b.process}: last heartbeat {relativeAge(b.beat_at)}</li>)}{!beats.length && <li>No worker/scheduler heartbeat recorded yet.</li>}</ul>
      </Section>

      <Section id="queue" title="Queue depth, job history and dead letters">
        <Table head={["Queue", "State", "Jobs"]} rows={queueDepth.map((r) => [r.name, r.state, r.n])} empty="Queue not initialized (start the worker once)." />
        <h3 className="mt-4 font-semibold">Recent runs</h3>
        <Table head={["Source", "Type", "Status", "Started", "Stats / error", "Correlation"]} rows={runs.map((r) => [r.key, r.job_type, r.status, relativeAge(r.started_at), r.error ?? JSON.stringify(r.stats), <code key="c" className="text-xs">{r.correlation_id.slice(0, 8)}</code>])} empty="No runs yet." />
        <h3 className="mt-4 font-semibold">Dead letters ({deadLetters.length})</h3>
        <Table head={["Queue", "Attempts", "Last error", "When", ""]} rows={deadLetters.map((d) => [d.queue, d.attempts, d.last_error, relativeAge(d.created_at), isAdmin ? <AdminAction key="a" action="dead-letter-resolve" payload={{ id: Number(d.id) }} label="Mark resolved" /> : null])} empty="No dead letters." />
      </Section>

      <Section id="review" title={`Review queue (${reviews.length})`}>
        {Object.entries(byKind).map(([kind, items]) => (
          <div key={kind} className="mt-3"><h3 className="font-semibold">{kind.replace(/_/g, " ")} ({items.length})</h3>
            <Table head={["Event", "Reason", "Opened", "Actions"]} rows={items.map((r) => [
              r.slug ? <Link key="l" href={`/admin/events/${r.event_id}`}>{r.event_name}</Link> : r.ref_id ?? r.source_id ?? "—", r.reason, relativeAge(r.created_at),
              <span key="a" className="flex flex-wrap gap-1">
                {r.event_id && r.publish_state === "in_review" && <AdminAction action="publish" payload={{ eventId: r.event_id, adminVerified: true }} label="Publish" variant="primary" confirm="Publish after checking the details against the source?" />}
                {r.event_id && r.publish_state === "in_review" && <AdminAction action="reject" payload={{ eventId: r.event_id }} label="Reject" variant="danger" prompt={{ field: "reason", question: "Reason for rejecting?" }} />}
                <AdminAction action="resolve-review" payload={{ id: r.id, status: "resolved" }} label="Resolve" />
                <AdminAction action="resolve-review" payload={{ id: r.id, status: "dismissed" }} label="Dismiss" />
              </span>,
            ])} empty="" />
          </div>
        ))}
        {!reviews.length && <p>Nothing to review.</p>}
      </Section>

      <Section id="submissions" title="Pending submissions">
        <Table head={["Kind", "Link", "Status", "Received", "Event"]} rows={submissions.map((s) => [s.kind, s.url ? <a key="u" href={s.url} rel="noopener noreferrer nofollow" target="_blank">{s.url.slice(0, 60)}</a> : "(flyer)", s.status, relativeAge(s.created_at), s.event_id ? <Link key="e" href={`/admin/events/${s.event_id}`}>open</Link> : "—"])} empty="No pending submissions." />
      </Section>

      <Section id="dedup" title="Duplicate candidates">
        <Table head={["A", "B", "Score", "Actions"]} rows={dedups.map((d) => [d.a_name, d.b_name, d.score, <span key="a" className="flex gap-1"><AdminAction action="merge" payload={{ survivorId: d.event_a, mergedId: d.event_b }} label="Merge B into A" confirm="Merge? Can be undone." /><AdminAction action="dedup-distinct" payload={{ candidateId: d.id }} label="Not duplicates" /></span>])} empty="No pending duplicate candidates." />
        <h3 className="mt-4 font-semibold">Recent merges</h3>
        <Table head={["Survivor", "Merged", "By", "When", ""]} rows={merges.map((m) => [m.s_name, m.m_name, `${m.method} · ${m.actor}`, relativeAge(m.created_at), m.undone_at ? "undone" : <AdminAction key="u" action="unmerge" payload={{ mergeId: m.id }} label="Unmerge" confirm="Undo this merge?" />])} empty="No merges." />
      </Section>

      <Section id="conflicts" title="Conflicting fields">
        <Table head={["Event", "Field", "Values", ""]} rows={conflicts.map((c) => [c.name, c.field, <code key="v" className="text-xs">{JSON.stringify(c.candidates).slice(0, 160)}</code>, <AdminAction key="r" action="resolve-conflict" payload={{ conflictId: c.id }} label="Mark resolved" prompt={{ field: "note", question: "Resolution note (which value is correct and why)?" }} />])} empty="No open conflicts." />
      </Section>

      <Section id="claims" title="Organizer claims">
        <Table head={["Organization", "User", "Method", "Evidence", ""]} rows={claims.map((c) => [c.org, c.email, c.verification_method, c.evidence, <span key="a" className="flex gap-1"><AdminAction action="claim" payload={{ id: c.id, decision: "approved" }} label="Approve" variant="primary" /><AdminAction action="claim" payload={{ id: c.id, decision: "rejected" }} label="Reject" variant="danger" /></span>])} empty="No pending claims." />
      </Section>

      <Section id="corrections" title="Reported corrections">
        <Table head={["Event", "Field", "Message", "Evidence", ""]} rows={corrections.map((c) => [<Link key="e" href={`/admin/events/${c.event_id}`}>{c.name}</Link>, c.field, c.message, c.evidence_url ?? "—", <span key="a" className="flex gap-1"><AdminAction action="correction" payload={{ id: c.id, status: "applied" }} label="Applied" /><AdminAction action="correction" payload={{ id: c.id, status: "dismissed" }} label="Dismiss" /></span>])} empty="No open corrections." />
      </Section>

      <Section id="sources" title="Source registry and health">
        <Table head={["Source", "Status", "Last success", "Failures", "Cadence", "Counts", "Last error", ""]} rows={sources.map((s) => [
          <span key="n">{s.name}<span className="block text-xs text-muted">{s.key} · {s.connector_key} {s.parser_version}</span></span>,
          <span key="s">{s.paused ? "PAUSED · " : ""}{s.status}<span className="block text-xs text-muted">{s.status_reason}</span></span>,
          s.last_success_at ? relativeAge(s.last_success_at) : "never", s.consecutive_failures, `${s.refresh_cadence_minutes} min · ${s.rate_limit_per_minute}/min`,
          `${s.discovered_count} found · ${s.published_count} published · ${s.rejected_count} rejected`, (s.last_errors?.[0]?.error ?? "—"),
          isAdmin ? <span key="a" className="flex flex-col gap-1"><AdminAction action="source-update" payload={{ sourceId: s.id, paused: !s.paused }} label={s.paused ? "Resume" : "Pause"} /><AdminAction action="reparse" payload={{ sourceId: s.id }} label="Re-parse" /></span> : null,
        ])} empty="" />
      </Section>

      <Section id="budget" title="Crawl budget">
        <p>Share of hourly fetch capacity per bucket (admin-editable; default 60/25/15).</p>
        <Table head={["Bucket", "Weight"]} rows={budget.map((b) => [b.bucket, `${Math.round(b.weight * 100)}%`])} empty="" />
        {isAdmin && <AdminAction action="budget" payload={{ dfw: 0.6, us: 0.25, intl: 0.15 }} label="Reset to 60/25/15" />}
      </Section>

      <Section id="audit" title="Audit log (latest 25)">
        <Table head={["When", "Actor", "Action", "Target"]} rows={auditTail.map((a) => [relativeAge(a.at), a.actor, a.action, `${a.target_type ?? ""} ${a.target_id ?? ""}`])} empty="No admin actions yet." />
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-h`} className="mt-8 scroll-mt-20"><h2 id={`${id}-h`} className="mb-2 text-lg font-bold">{title}</h2>{children}</section>;
}
function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return empty ? <p className="text-muted">{empty}</p> : null;
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={head.join(", ")}>
      <table className="w-full min-w-[640px] text-left"><thead><tr className="border-b border-line">{head.map((h) => <th key={h} className="py-1 pr-3">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line align-top">{r.map((c, j) => <td key={j} className="py-1 pr-3">{c}</td>)}</tr>)}</tbody></table>
    </div>
  );
}
