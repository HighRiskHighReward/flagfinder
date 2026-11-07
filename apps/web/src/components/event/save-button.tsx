"use client";
import { Heart } from "lucide-react";
import { useState } from "react";

export function SaveButton({ eventId, disabled }: { eventId: string; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "saved" | "login" | "error">("idle");
  if (disabled) return <span className="tap inline-flex items-center rounded-lg border border-dashed border-line-strong px-3 text-sm text-muted">Demo events can&apos;t be saved</span>;
  const save = async () => {
    const r = await fetch("/api/favorites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId }) });
    setState(r.status === 401 ? "login" : r.ok ? "saved" : "error");
  };
  return (
    <>
      <button type="button" onClick={save} aria-pressed={state === "saved"} className="tap inline-flex items-center gap-2 rounded-lg border border-line-strong px-4 hover:bg-surface">
        <Heart size={16} aria-hidden="true" fill={state === "saved" ? "currentColor" : "none"} />{state === "saved" ? "Saved" : "Save"}
      </button>
      {state === "login" && <a href={`/account?next=/events`} className="self-center text-sm">Sign in to save events and get alerts</a>}
      {state === "error" && <span role="alert" className="self-center text-sm text-danger">Couldn&apos;t save. Try again.</span>}
    </>
  );
}
