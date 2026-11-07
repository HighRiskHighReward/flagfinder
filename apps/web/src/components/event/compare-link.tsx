"use client";
import { useState } from "react";

/** Adds the event to a local compare tray (max 3, stored only in this browser). */
export function CompareLink({ eventId }: { eventId: string }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const add = () => {
    let cur: string[] = [];
    try { cur = JSON.parse(localStorage.getItem("ff-compare") ?? "[]"); } catch { /* ignore */ }
    const next = [eventId, ...cur.filter((x) => x !== eventId)].slice(0, 3);
    try { localStorage.setItem("ff-compare", JSON.stringify(next)); } catch { /* ignore */ }
    setIds(next);
  };
  return ids ? <a className="tap inline-flex items-center rounded-lg border border-line-strong px-3 no-underline" href={`/compare?ids=${ids.join(",")}`}>Compare {ids.length} event{ids.length > 1 ? "s" : ""} →</a>
    : <button type="button" onClick={add} className="tap inline-flex items-center rounded-lg border border-line-strong px-3">Add to compare</button>;
}
