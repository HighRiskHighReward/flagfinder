"use client";
import { useState } from "react";

export function SaveSearchButton({ query }: { query: string }) {
  const [msg, setMsg] = useState("");
  const save = async () => {
    const name = window.prompt("Name this search", "My search");
    if (!name) return;
    const r = await fetch("/api/saved-searches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, query }) });
    setMsg(r.status === 401 ? "Sign in to save searches" : r.ok ? "Saved" : "Couldn't save");
  };
  return <span className="inline-flex items-center gap-1"><button type="button" onClick={save} className="tap rounded-lg px-2 text-sm underline">Save this search</button><span role="status" className="text-xs">{msg}</span></span>;
}
