"use client";
import { useState } from "react";

export function AuthForms() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setErr("");
    const fd = new FormData(e.currentTarget);
    const body = mode === "up" ? { email: fd.get("email"), password: fd.get("password"), name: fd.get("name") || String(fd.get("email")).split("@")[0] } : { email: fd.get("email"), password: fd.get("password") };
    const r = await fetch(`/api/auth/${mode === "up" ? "sign-up" : "sign-in"}/email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) window.location.reload(); else setErr((await r.json().catch(() => ({}))).message ?? "Couldn't sign in. Check your email and password.");
  };
  return (
    <div className="mt-6 max-w-sm">
      <div className="flex gap-2" role="tablist">
        <button role="tab" aria-selected={mode === "in"} className={`tap flex-1 rounded-lg ${mode === "in" ? "bg-primary text-on-primary" : "border border-line-strong"}`} onClick={() => setMode("in")}>Sign in</button>
        <button role="tab" aria-selected={mode === "up"} className={`tap flex-1 rounded-lg ${mode === "up" ? "bg-primary text-on-primary" : "border border-line-strong"}`} onClick={() => setMode("up")}>Create account</button>
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        {mode === "up" && <label className="flex flex-col gap-1 text-sm font-medium">Your name (shown only to you)<input name="name" autoComplete="name" className="tap rounded-lg border border-line-strong bg-bg px-3" /></label>}
        <label className="flex flex-col gap-1 text-sm font-medium">Email<input name="email" type="email" required autoComplete="email" className="tap rounded-lg border border-line-strong bg-bg px-3" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">Password<input name="password" type="password" required minLength={10} autoComplete={mode === "up" ? "new-password" : "current-password"} className="tap rounded-lg border border-line-strong bg-bg px-3" aria-describedby="pw-help" /></label>
        {mode === "up" && <span id="pw-help" className="text-xs text-muted">At least 10 characters. Accounts are for adults (coaches, parents, organizers). We don&apos;t collect children&apos;s information.</span>}
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <button disabled={busy} className="tap rounded-lg bg-primary font-semibold text-on-primary">{mode === "up" ? "Create account" : "Sign in"}</button>
      </form>
    </div>
  );
}

export function SignOut() {
  return <button className="tap rounded-lg border border-line-strong px-4" onClick={async () => { await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); window.location.href = "/"; }}>Sign out</button>;
}

export function AlertPrefs({ frequency, confirmed }: { frequency: string | null; confirmed: boolean }) {
  const [msg, setMsg] = useState("");
  const save = async (f: string) => {
    const r = await fetch("/api/alerts/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ frequency: f }) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? (d.confirmationSent ? "Check your email to confirm alerts." : "Saved.") : d.error ?? "Error");
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm" htmlFor="freq">Email alerts</label>
      <select id="freq" defaultValue={frequency ?? "off"} onChange={(e) => save(e.target.value)} className="tap rounded-lg border border-line-strong bg-bg px-2">
        <option value="instant">Instant</option><option value="daily">Daily digest</option><option value="weekly">Weekly digest</option><option value="off">Off</option>
      </select>
      <span className="text-sm text-muted">{confirmed ? "Confirmed" : frequency && frequency !== "off" ? "Waiting for email confirmation" : ""}</span>
      <span role="status" className="text-sm">{msg}</span>
    </div>
  );
}

export function RemoveSavedSearch({ id }: { id: string }) {
  return <button className="tap rounded-md px-2 text-sm underline" onClick={async () => { await fetch("/api/saved-searches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x", query: "", remove: id }) }); window.location.reload(); }}>Remove</button>;
}
