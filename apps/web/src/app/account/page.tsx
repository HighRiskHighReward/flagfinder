import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/server";
import { currentUser } from "@/lib/auth-server";
import { AlertPrefs, AuthForms, RemoveSavedSearch, SignOut } from "@/components/auth-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ alerts?: string }> }) {
  const u = await currentUser();
  const sp = await searchParams;
  if (!u) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-3xl font-bold">Your account</h1>
        <p className="mt-2 text-muted">You can browse, search, share and download calendars without an account. Sign in to save events, save searches, get alerts and plan your season.</p>
        <AuthForms />
      </div>
    );
  }
  const [favs, searches, pref] = await Promise.all([
    db().query(`SELECT e.slug, e.name, e.start_date, e.status FROM favorites f JOIN events e ON e.id=f.event_id WHERE f.user_id=$1 ORDER BY e.start_date`, [u.id]).then((r) => r.rows),
    db().query(`SELECT id, name, query FROM saved_searches WHERE user_id=$1 ORDER BY created_at DESC`, [u.id]).then((r) => r.rows),
    db().query(`SELECT frequency, confirmed_at, unsubscribed_at FROM alert_preferences WHERE user_id=$1`, [u.id]).then((r) => r.rows[0]),
  ]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center gap-3"><h1 className="text-3xl font-bold">Your account</h1><span className="ml-auto"><SignOut /></span></div>
      <p className="text-muted">{u.email}{u.role !== "user" ? ` · ${u.role}` : ""}</p>
      {sp.alerts === "confirmed" && <p role="status" className="mt-3 rounded-lg border border-success p-3 text-success">Alerts confirmed.</p>}
      <section className="mt-6"><h2 className="text-xl font-bold">Alerts</h2>
        <p className="text-sm text-muted">We email you when saved events change (dates, venue, price, registration, cancellation) and when new events match your saved searches. Every email has a one-click unsubscribe link.</p>
        <div className="mt-2"><AlertPrefs frequency={pref?.unsubscribed_at ? "off" : pref?.frequency ?? null} confirmed={!!pref?.confirmed_at && !pref?.unsubscribed_at} /></div>
      </section>
      <section className="mt-6"><h2 className="text-xl font-bold">Saved events</h2>
        {favs.length ? <ul className="mt-2 list-disc pl-5">{favs.map((f) => <li key={f.slug}><Link href={`/events/${f.slug}`}>{f.name}</Link> · {f.start_date ?? "date TBA"}{f.status !== "scheduled" ? ` · ${f.status}` : ""}</li>)}</ul> : <p className="text-sm">No saved events yet. Use “Save” on any event page.</p>}
      </section>
      <section className="mt-6"><h2 className="text-xl font-bold">Saved searches</h2>
        {searches.length ? <ul className="mt-2 flex flex-col gap-1">{searches.map((s) => <li key={s.id}><Link href={`/?${s.query}`}>{s.name}</Link> <RemoveSavedSearch id={s.id} /></li>)}</ul> : <p className="text-sm">Use “Save this search” on the results page.</p>}
      </section>
      <section className="mt-6 flex flex-wrap gap-3"><Link href="/planner">Season planner</Link><Link href="/organizers">Organizer tools</Link>{(u.role === "moderator" || u.role === "admin") && <Link href="/admin">Admin</Link>}</section>
    </div>
  );
}
