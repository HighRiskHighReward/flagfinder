import type { Metadata } from "next";
import Link from "next/link";
import { formatDateRange, plannerConflicts } from "@ff/core";
import { db } from "@/lib/server";
import { currentUser } from "@/lib/auth-server";
import { PlannerControls } from "@/components/planner-controls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Season planner", robots: { index: false } };

export default async function PlannerPage() {
  const u = await currentUser();
  if (!u) return <div className="mx-auto max-w-2xl px-4 py-8"><h1 className="text-2xl font-bold">Season planner</h1><p className="mt-2"><Link href="/account">Sign in</Link> to plan your team&apos;s season and get date-conflict warnings.</p></div>;
  const plans = (await db().query(`SELECT * FROM planner_plans WHERE user_id=$1 ORDER BY created_at`, [u.id])).rows;
  const favs = (await db().query(`SELECT e.id, e.name FROM favorites f JOIN events e ON e.id=f.event_id WHERE f.user_id=$1 ORDER BY e.start_date`, [u.id])).rows;
  const data = await Promise.all(plans.map(async (p) => {
    const items = (await db().query(`SELECT e.id, e.name, e.slug, e.start_date, e.end_date, e.date_precision, pi.travel_days_before, pi.travel_days_after FROM planner_items pi JOIN events e ON e.id=pi.event_id WHERE pi.plan_id=$1 ORDER BY e.start_date NULLS LAST`, [p.id])).rows;
    const c = plannerConflicts(items.map((i) => ({ eventId: i.id, name: i.name, startDate: i.start_date, endDate: i.end_date, travelDaysBefore: i.travel_days_before, travelDaysAfter: i.travel_days_after })));
    return { plan: p, items, ...c };
  }));
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Season planner</h1>
      <PlannerControls plans={plans.map((p) => ({ id: p.id, name: p.name }))} favorites={favs} />
      {data.map(({ plan, items, conflicts, undated }) => (
        <section key={plan.id} className="mt-6" data-testid="plan">
          <h2 className="text-xl font-bold">{plan.name}</h2>
          {conflicts.length > 0 && <ul role="alert" className="mt-2 rounded-lg border border-warning p-3 text-sm text-warning" data-testid="conflicts">{conflicts.map((c, i) => <li key={i}>⚠ {c.detail}</li>)}</ul>}
          {undated.length > 0 && <p className="mt-2 text-sm text-muted">{undated.length} event(s) have no published dates yet, so conflicts can&apos;t be checked for them.</p>}
          <ul className="mt-2 flex flex-col gap-1 text-sm">{items.map((i) => <li key={i.id}><Link href={`/events/${i.slug}`}>{i.name}</Link> · {formatDateRange(i.start_date, i.end_date, i.date_precision)}{i.travel_days_before || i.travel_days_after ? ` · travel ${i.travel_days_before}d before / ${i.travel_days_after}d after` : ""}</li>)}</ul>
        </section>
      ))}
    </div>
  );
}
