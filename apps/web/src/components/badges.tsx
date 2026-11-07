import { ShieldCheck, Clock, AlertTriangle } from "lucide-react";
import { relativeAge } from "@ff/core";
import { verificationLabel } from "@/lib/format";

export function DemoBadge() {
  return <span data-testid="demo-badge" className="inline-flex items-center rounded-md bg-demo-bg px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-demo-text">Demo data</span>;
}

export function VerificationBadge({ level }: { level: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <ShieldCheck aria-hidden="true" size={14} />{verificationLabel(level)}
    </span>
  );
}

export function FreshnessText({ lastSuccessAt, lastCheckedAt }: { lastSuccessAt: string | null; lastCheckedAt: string | null }) {
  const stale = !lastSuccessAt || Date.now() - new Date(lastSuccessAt).getTime() > 72 * 3600_000;
  const failedSince = lastCheckedAt && lastSuccessAt && new Date(lastCheckedAt) > new Date(lastSuccessAt);
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${stale ? "text-warning" : "text-muted"}`}>
      {stale ? <AlertTriangle aria-hidden="true" size={14} /> : <Clock aria-hidden="true" size={14} />}
      {lastSuccessAt ? `Checked ${relativeAge(lastSuccessAt)}` : "Not yet checked successfully"}
      {failedSince ? " · last attempt failed" : ""}{stale && lastSuccessAt ? " · may be out of date" : ""}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "scheduled") return null;
  const label = status === "cancelled" ? "Cancelled" : status === "postponed" ? "Postponed" : status === "source_missing" ? "Listing not found at source" : status;
  return <span className="inline-flex rounded-md border border-danger px-2 py-0.5 text-xs font-bold text-danger">{label}</span>;
}
