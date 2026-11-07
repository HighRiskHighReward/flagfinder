"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminAction({ action, payload, label, confirm, prompt, variant = "default" }: { action: string; payload: Record<string, unknown>; label: string; confirm?: string; prompt?: { field: string; question: string }; variant?: "default" | "primary" | "danger" }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const run = async () => {
    if (confirm && !window.confirm(confirm)) return;
    const body = { ...payload };
    if (prompt) { const v = window.prompt(prompt.question); if (v === null) return; body[prompt.field] = v || null; }
    const r = await fetch(`/api/admin/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) { setMsg("Done"); router.refresh(); } else setMsg((await r.json().catch(() => ({}))).error ?? `Error ${r.status}`);
  };
  const cls = variant === "primary" ? "bg-primary text-on-primary" : variant === "danger" ? "border border-danger text-danger" : "border border-line-strong";
  return <span className="inline-flex items-center gap-2"><button type="button" onClick={run} className={`tap rounded-md px-3 text-sm ${cls}`}>{label}</button>{msg && <span role="status" className="text-xs">{msg}</span>}</span>;
}
