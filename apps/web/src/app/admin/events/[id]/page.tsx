import { forbidden, notFound, unauthorized } from "next/navigation";
import { db } from "@/lib/server";
import { currentUser, hasRole } from "@/lib/auth-server";
import { AdminAction } from "@/components/admin-action";
import { ModeratorEditForm } from "@/components/moderator-edit-form";

export const dynamic = "force-dynamic";

/** Moderator view of one event (any publish state), including raw normalized source data as inert text. */
export default async function AdminEvent({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) unauthorized();
  if (!hasRole(user, "moderator")) forbidden();
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const e = (await db().query(`SELECT * FROM events WHERE id=$1`, [id])).rows[0];
  if (!e) notFound();
  const srcs = (await db().query(`SELECT sr.url, sr.normalized, sr.record_status, s.name FROM source_records sr JOIN sources s ON s.id=sr.source_id WHERE sr.event_id=$1`, [id])).rows;
  const subs = (await db().query(`SELECT * FROM submissions WHERE event_id=$1`, [id])).rows;
  const reviews = (await db().query(`SELECT kind, reason, payload FROM review_items WHERE event_id=$1 AND status='open'`, [id])).rows;
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 text-sm">
      <p><a href="/admin#review">← Admin</a></p>
      <h1 className="mt-2 text-2xl font-bold">{e.name}</h1>
      <p className="text-muted">State: {e.publish_state} · scope: {e.sport_scope} · dates: {e.start_date ?? "unknown"} → {e.end_date ?? "unknown"} · verification: {e.verification_level}</p>
      <h2 className="mt-4 font-bold">Open review reasons</h2>
      <ul className="list-disc pl-5">{reviews.map((r, i) => <li key={i}>{r.kind}: {r.reason}</li>)}</ul>
      <h2 className="mt-4 font-bold">Sources</h2>
      {srcs.map((s, i) => (
        <details key={i} className="mt-2 rounded border border-line p-2"><summary>{s.name}: <a href={s.url} rel="noopener noreferrer nofollow" target="_blank">{s.url}</a> ({s.record_status})</summary>
          {/* External content rendered as text only (never HTML). */}
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(s.normalized, null, 2)}</pre></details>
      ))}
      {subs.map((s) => <p key={s.id} className="mt-2">Submission: {s.kind} · {s.status} · note: {s.submitter_note ?? "—"}</p>)}
      <h2 className="mt-6 font-bold">Edit reviewed fields</h2>
      <ModeratorEditForm eventId={id} initial={{ name: e.name, startDate: e.start_date, endDate: e.end_date, registrationUrl: e.registration_url, sportScope: e.sport_scope }} />
      {e.publish_state === "in_review" && (
        <div className="mt-6 flex flex-wrap gap-2">
          <AdminAction action="publish" payload={{ eventId: id, adminVerified: true }} label="Publish (verified against sources)" variant="primary" prompt={{ field: "sourceUrl", question: "Supporting source URL (leave blank if the event already has one)" }} />
          <AdminAction action="reject" payload={{ eventId: id }} label="Reject" variant="danger" prompt={{ field: "reason", question: "Reason?" }} />
        </div>
      )}
    </div>
  );
}
