import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/server";
import { currentUser } from "@/lib/auth-server";
import { ClaimForm } from "@/components/claim-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "For organizers" };

export default async function OrganizersPage() {
  const u = await currentUser();
  const orgs = (await db().query(`SELECT id, name FROM organizers WHERE NOT is_synthetic ORDER BY name LIMIT 500`)).rows;
  const mine = u ? (await db().query(`SELECT oc.status, o.name FROM organizer_claims oc JOIN organizers o ON o.id=oc.organizer_id WHERE oc.user_id=$1`, [u.id])).rows : [];
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold">For organizers</h1>
      <ul className="mt-3 list-disc pl-5 text-sm">
        <li><Link href="/submit">Submit an event</Link> by link or flyer. A moderator reviews it before it appears.</li>
        <li>Claim your organization to confirm details and send corrections. Confirmed details show as “Organizer confirmed”.</li>
        <li>Want your public calendar monitored automatically? Tell us where it lives and that we have your permission to read it.</li>
      </ul>
      {!u ? <p className="mt-6"><Link href="/account">Sign in</Link> to claim an organization.</p> : (
        <>
          {mine.length > 0 && <ul className="mt-6 text-sm">{mine.map((m, i) => <li key={i}>{m.name}: claim {m.status}</li>)}</ul>}
          <h2 className="mt-6 text-xl font-bold">Claim an organization</h2>
          {orgs.length ? <ClaimForm orgs={orgs} /> : <p className="mt-2 text-sm">No organizations are listed yet. Submit an event first.</p>}
        </>
      )}
    </div>
  );
}
