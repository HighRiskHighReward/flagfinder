"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PlannerControls({ plans, favorites }: { plans: { id: string; name: string }[]; favorites: { id: string; name: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const post = async (body: unknown) => {
    const r = await fetch("/api/planner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setMsg(r.ok ? "Saved" : (await r.json().catch(() => ({}))).error ?? "Error");
    if (r.ok) router.refresh();
  };
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-line p-4 text-sm">
      <form className="flex flex-wrap items-end gap-2" action={(fd) => post({ op: "create", name: String(fd.get("name")) })}>
        <label className="flex flex-col gap-1">New plan name<input name="name" required className="tap rounded-lg border border-line-strong bg-bg px-2" defaultValue="Spring season" /></label>
        <button className="tap rounded-lg bg-primary px-3 text-on-primary">Create plan</button>
      </form>
      {plans.length > 0 && favorites.length > 0 && (
        <form className="flex flex-wrap items-end gap-2" action={(fd) => post({ op: "add", planId: fd.get("planId"), eventId: fd.get("eventId"), travelDaysBefore: Number(fd.get("before")), travelDaysAfter: Number(fd.get("after")) })}>
          <label className="flex flex-col gap-1">Plan<select name="planId" className="tap rounded-lg border border-line-strong bg-bg px-2">{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="flex flex-col gap-1">Saved event<select name="eventId" className="tap rounded-lg border border-line-strong bg-bg px-2">{favorites.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label className="flex flex-col gap-1">Travel days before<input name="before" type="number" min={0} max={7} defaultValue={0} className="tap w-20 rounded-lg border border-line-strong bg-bg px-2" /></label>
          <label className="flex flex-col gap-1">after<input name="after" type="number" min={0} max={7} defaultValue={0} className="tap w-20 rounded-lg border border-line-strong bg-bg px-2" /></label>
          <button className="tap rounded-lg border border-line-strong px-3">Add to plan</button>
        </form>
      )}
      {favorites.length === 0 && <p className="text-muted">Save events first (the Save button on event pages), then add them to a plan.</p>}
      <span role="status">{msg}</span>
    </div>
  );
}
