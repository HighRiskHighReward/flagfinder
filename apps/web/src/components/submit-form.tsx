"use client";
import { useState } from "react";

export function SubmitForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setState("sending");
    const r = await fetch("/api/submissions", { method: "POST", body: new FormData(e.currentTarget) });
    if (r.ok) setState("done"); else { setState("error"); setErr((await r.json().catch(() => ({}))).error ?? "Something went wrong."); }
  };
  if (state === "done") return <p role="status" className="mt-6 rounded-xl border border-line p-4">Thanks! Your submission is in the moderation queue. If we can&apos;t read the link, we&apos;ll keep it and mark it “awaiting verification” rather than guessing.</p>;
  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" encType="multipart/form-data">
      <label className="flex flex-col gap-1 font-medium">Link to the event page or public post
        <input name="url" type="url" inputMode="url" placeholder="https://" className="tap rounded-lg border border-line-strong bg-bg px-3" aria-describedby="url-help" />
        <span id="url-help" className="text-xs font-normal text-muted">Public pages only. We respect sites that don&apos;t allow automated access.</span>
      </label>
      <label className="flex flex-col gap-1 font-medium">Or upload a flyer (PNG, JPEG, WebP or PDF, up to 8 MB)
        <input name="flyer" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="tap rounded-lg border border-line-strong bg-bg p-2" />
      </label>
      <label className="flex flex-col gap-1 font-medium">Anything we should know? (optional)
        <textarea name="note" rows={3} maxLength={1000} className="rounded-lg border border-line-strong bg-bg p-2" />
      </label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="noChildData" required className="mt-1 h-5 w-5" />This submission doesn&apos;t include children&apos;s names, photos or other personal information.</label>
      <label className="hidden" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      {state === "error" && <p role="alert" className="text-danger">{err}</p>}
      <button disabled={state === "sending"} className="tap rounded-lg bg-primary font-semibold text-on-primary hover:bg-primary-hover">{state === "sending" ? "Sending…" : "Submit for review"}</button>
    </form>
  );
}
