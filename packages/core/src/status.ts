import type { EventStatus } from "./types";

/**
 * Status changes require explicit published evidence (Invariant 4). A missing page or a 404
 * produces `source_missing` (and a review item) — never `cancelled`.
 */
export type StatusSignal =
  | { kind: "explicit"; status: "cancelled" | "postponed" | "scheduled"; evidence: string }
  | { kind: "http_missing"; httpStatus: number }
  | { kind: "none" };

const CANCEL_RE = /\b(event|tournament|league|season|this)?\s*(has been|is|was)\s+(cancell?ed|canceled)\b|\bcancell?ed\b/i;
const POSTPONE_RE = /\b(postponed|rescheduled to|has been moved to|new date)\b/i;

/** Looks for explicit wording in a structured status or short published text. */
export function detectStatusSignal(input: { schemaEventStatus?: string | null; text?: string | null; httpStatus?: number }): StatusSignal {
  if (input.httpStatus === 404 || input.httpStatus === 410) return { kind: "http_missing", httpStatus: input.httpStatus };
  const s = input.schemaEventStatus ?? "";
  if (/EventCancelled$/.test(s)) return { kind: "explicit", status: "cancelled", evidence: `schema.org eventStatus=${s}` };
  if (/EventPostponed$|EventRescheduled$/.test(s)) return { kind: "explicit", status: "postponed", evidence: `schema.org eventStatus=${s}` };
  const t = input.text ?? "";
  const c = t.match(CANCEL_RE);
  if (c) return { kind: "explicit", status: "cancelled", evidence: snippet(t, c.index ?? 0) };
  const p = t.match(POSTPONE_RE);
  if (p) return { kind: "explicit", status: "postponed", evidence: snippet(t, p.index ?? 0) };
  return { kind: "none" };
}

function snippet(t: string, i: number) {
  return t.slice(Math.max(0, i - 60), i + 80).replace(/\s+/g, " ").trim();
}

export function nextStatus(current: EventStatus, signal: StatusSignal): { status: EventStatus; evidence: string | null; needsReview: boolean } {
  switch (signal.kind) {
    case "explicit":
      return { status: signal.status, evidence: signal.evidence, needsReview: signal.status !== current };
    case "http_missing":
      // Never infer cancellation. Keep a cancelled/postponed status if it was explicitly published.
      return { status: current === "cancelled" || current === "postponed" ? current : "source_missing", evidence: null, needsReview: true };
    default:
      return { status: current === "source_missing" ? "scheduled" : current, evidence: null, needsReview: false };
  }
}
