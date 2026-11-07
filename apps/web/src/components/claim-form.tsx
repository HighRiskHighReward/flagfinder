"use client";
import { useState } from "react";

export function ClaimForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [msg, setMsg] = useState("");
  const submit = async (fd: FormData) => {
    const r = await fetch("/api/claims", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizerId: fd.get("org"), method: fd.get("method"), evidence: fd.get("evidence") }) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? (d.verificationToken ? `Submitted. To verify, publish this token on your website: ${d.verificationToken}` : "Submitted. A moderator will verify and follow up.") : d.error ?? "Error");
  };
  return (
    <form action={submit} className="mt-3 flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1 font-medium">Organization<select name="org" className="tap rounded-lg border border-line-strong bg-bg px-2">{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 font-medium">How can we verify you?<select name="method" className="tap rounded-lg border border-line-strong bg-bg px-2"><option value="email_domain">My account email uses the organization&apos;s domain</option><option value="website_token">I can publish a token on our website</option><option value="manual">Other (explain below)</option></select></label>
      <label className="flex flex-col gap-1 font-medium">Your role and how to confirm it<textarea name="evidence" required minLength={20} rows={3} className="rounded-lg border border-line-strong bg-bg p-2" /></label>
      <button className="tap self-start rounded-lg bg-primary px-4 font-semibold text-on-primary">Request claim</button>
      <p role="status">{msg}</p>
    </form>
  );
}
