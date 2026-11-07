"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ModeratorEditForm({ eventId, initial }: { eventId: string; initial: { name: string; startDate: string | null; endDate: string | null; registrationUrl: string | null; sportScope: string } }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const submit = async (fd: FormData) => {
    const val = (k: string) => { const v = String(fd.get(k) ?? "").trim(); return v || null; };
    const r = await fetch("/api/admin/edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId, patch: { name: val("name") ?? initial.name, startDate: val("startDate"), endDate: val("endDate"), registrationUrl: val("registrationUrl"), sportScope: val("sportScope") ?? undefined } }) });
    setMsg(r.ok ? "Saved" : (await r.json().catch(() => ({}))).error ?? "Error");
    if (r.ok) router.refresh();
  };
  return (
    <form action={submit} className="mt-2 grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1">Name<input name="name" defaultValue={initial.name} className="tap rounded border border-line-strong bg-bg px-2" /></label>
      <label className="flex flex-col gap-1">Scope<select name="sportScope" defaultValue={initial.sportScope} className="tap rounded border border-line-strong bg-bg px-2">{["flag", "mixed", "tackle", "7v7_passing_non_flag", "unknown"].map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className="flex flex-col gap-1">Start date<input type="date" name="startDate" defaultValue={initial.startDate ?? ""} className="tap rounded border border-line-strong bg-bg px-2" /></label>
      <label className="flex flex-col gap-1">End date<input type="date" name="endDate" defaultValue={initial.endDate ?? ""} className="tap rounded border border-line-strong bg-bg px-2" /></label>
      <label className="flex flex-col gap-1 sm:col-span-2">Registration URL<input type="url" name="registrationUrl" defaultValue={initial.registrationUrl ?? ""} className="tap rounded border border-line-strong bg-bg px-2" /></label>
      <div className="sm:col-span-2"><button className="tap rounded bg-primary px-4 text-on-primary">Save changes</button> <span role="status">{msg}</span></div>
    </form>
  );
}
