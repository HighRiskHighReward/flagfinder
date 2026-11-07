"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Pref = "system" | "light" | "dark";

export function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => {
    try { const t = localStorage.getItem("ff-theme"); if (t === "light" || t === "dark") setPref(t); } catch { /* storage unavailable */ }
  }, []);
  const next: Record<Pref, Pref> = { system: "light", light: "dark", dark: "system" };
  const apply = (p: Pref) => {
    setPref(p);
    try { if (p === "system") localStorage.removeItem("ff-theme"); else localStorage.setItem("ff-theme", p); } catch { /* ignore */ }
    if (p === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = p;
  };
  const Icon = pref === "light" ? Sun : pref === "dark" ? Moon : Monitor;
  return (
    <button type="button" onClick={() => apply(next[pref])} className="tap flex items-center justify-center rounded-md text-fg hover:bg-surface"
      aria-label={`Theme: ${pref}. Switch to ${next[pref]}.`} data-testid="theme-toggle" data-pref={pref}>
      <Icon aria-hidden="true" size={20} />
    </button>
  );
}
