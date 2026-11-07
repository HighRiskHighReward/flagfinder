import { addDays } from "./dates";

/** RFC 5545 calendar export. All-day events use VALUE=DATE (no UTC shifting). */
export interface IcsEvent {
  uid: string; name: string; url: string; startDate: string | null; endDate: string | null; startAt: string | null; endAt: string | null;
  location: string | null; description: string | null; status: string; datePrecision: string;
}

function esc(s: string) { return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function fold(line: string) {
  const out: string[] = [];
  let l = line;
  while (l.length > 74) { out.push(l.slice(0, 74)); l = " " + l.slice(74); }
  out.push(l);
  return out.join("\r\n");
}
const dt = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildIcs(events: IcsEvent[], prodId: string, now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${prodId}//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    if (!e.startDate || e.datePrecision === "tbd" || e.datePrecision === "month") continue; // never invent a date
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${dt(now.toISOString())}`);
    if (e.startAt) {
      lines.push(`DTSTART:${dt(e.startAt)}`);
      if (e.endAt) lines.push(`DTEND:${dt(e.endAt)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${e.startDate.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(e.endDate ?? e.startDate, 1).replace(/-/g, "")}`);
    }
    lines.push(`SUMMARY:${esc(e.name)}`, `URL:${e.url}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    lines.push(`DESCRIPTION:${esc(`${e.description ? e.description + "\n\n" : ""}Confirm details with the organizer: ${e.url}`)}`);
    lines.push(`STATUS:${e.status === "cancelled" ? "CANCELLED" : e.status === "postponed" ? "TENTATIVE" : "CONFIRMED"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarLink(e: IcsEvent): string | null {
  if (!e.startDate || e.datePrecision === "tbd" || e.datePrecision === "month") return null;
  const dates = e.startAt ? `${dt(e.startAt)}/${dt(e.endAt ?? e.startAt)}` : `${e.startDate.replace(/-/g, "")}/${addDays(e.endDate ?? e.startDate, 1).replace(/-/g, "")}`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.name, dates, details: `Confirm details with the organizer: ${e.url}`, location: e.location ?? "" });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function outlookCalendarLink(e: IcsEvent): string | null {
  if (!e.startDate || e.datePrecision === "tbd" || e.datePrecision === "month") return null;
  const allday = !e.startAt;
  const p = new URLSearchParams({
    path: "/calendar/action/compose", rru: "addevent", subject: e.name, body: `Confirm details with the organizer: ${e.url}`, location: e.location ?? "",
    startdt: allday ? e.startDate : e.startAt!, enddt: allday ? addDays(e.endDate ?? e.startDate, 1) : e.endAt ?? e.startAt!, allday: String(allday),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p}`;
}
