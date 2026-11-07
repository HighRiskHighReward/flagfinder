"use client";
import { useState } from "react";

const FIELDS = ["dates", "location", "divisions or ages", "price", "registration", "status (cancelled/postponed)", "other"];

export function ReportForm({ eventId }: { eventId: string }) {
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const submit = async (fd: FormData) => {
    const r = await fetch("/api/corrections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId, field: fd.get("field"), message: fd.get("message"), evidenceUrl: fd.get("evidenceUrl") || null, website: fd.get("website") }) });
    if (r.ok) setStatus("sent"); else { setStatus("error"); setError((await r.json().catch(() => ({}))).error ?? "Something went wrong."); }
  };
  if (status === "sent") return <p role="status" className="text-sm">Thanks. A moderator will review your report. We don&apos;t change listings until we can confirm the new details at a source.</p>;
  return (
    <form action={submit} className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1 font-medium">What&apos;s wrong?
        <select name="field" required className="tap rounded-lg border border-line-strong bg-bg px-2">{FIELDS.map((f) => <option key={f}>{f}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1 font-medium">Details
        <textarea name="message" required minLength={10} maxLength={2000} rows={3} className="rounded-lg border border-line-strong bg-bg p-2" aria-describedby="report-help" />
      </label>
      <span id="report-help" className="text-xs text-muted">Please don&apos;t include children&apos;s names or personal details.</span>
      <label className="flex flex-col gap-1 font-medium">Link to a source that shows the correct info (optional)
        <input name="evidenceUrl" type="url" className="tap rounded-lg border border-line-strong bg-bg px-2" />
      </label>
      <label className="hidden" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      {status === "error" && <p role="alert" className="text-danger">{error}</p>}
      <button className="tap self-start rounded-lg bg-primary px-5 font-semibold text-on-primary">Send report</button>
    </form>
  );
}
