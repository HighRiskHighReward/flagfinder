"use client";
import { Share2 } from "lucide-react";
import { useState } from "react";

export function ShareButton({ url, title }: { url: string; title: string }) {
  const [msg, setMsg] = useState("");
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ url, title }); return; }
      await navigator.clipboard.writeText(url);
      setMsg("Link copied");
    } catch { setMsg("Couldn't share. Copy the address bar link instead."); }
  };
  return (
    <>
      <button type="button" onClick={share} className="tap inline-flex items-center gap-2 rounded-lg border border-line-strong px-4 hover:bg-surface"><Share2 size={16} aria-hidden="true" />Share</button>
      <span role="status" className="self-center text-sm">{msg}</span>
    </>
  );
}
