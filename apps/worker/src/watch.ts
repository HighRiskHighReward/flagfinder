import type pg from "pg";
import { createPoliteHttp, type PoliteHttp } from "@ff/connectors";
import { sha256 } from "@ff/core";
import type { Logger } from "./log";

/**
 * Watched organizer pages (ADR-025). Some permitted organizers publish seasons only as prose,
 * not as feeds or structured data, so a per-site parser would have to guess. Instead we check
 * each page on its cadence (robots.txt and rate limits enforced by PoliteHttp). When the
 * visible text changes, the page is filed as a submission, so the existing moderated pipeline
 * extracts it (LLM when configured, otherwise manual review). Nothing is published here.
 *
 * Source config: { pageUrls: string[], hashes?: Record<url, sha256> }.
 */
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface WatchSource { id: string; key: string; name: string; config: { pageUrls?: string[]; hashes?: Record<string, string> }; refresh_cadence_minutes: number; rate_limit_per_minute: number; last_success_at: Date | null }

export async function watchPages(db: pg.Pool, deps: { log: Logger; httpFor?: (s: WatchSource) => PoliteHttp; now?: Date }) {
  const now = deps.now ?? new Date();
  const due = (await db.query<WatchSource>(
    `SELECT id, key, name, config, refresh_cadence_minutes, rate_limit_per_minute, last_success_at FROM sources
      WHERE connector_key='watch' AND status='enabled' AND NOT paused AND NOT is_synthetic
        AND (circuit_open_until IS NULL OR circuit_open_until < $1)
        AND (last_success_at IS NULL OR last_success_at < $1::timestamptz - make_interval(mins => refresh_cadence_minutes))
        AND (last_attempt_at IS NULL OR last_attempt_at < $1::timestamptz - interval '30 minutes')`, [now])).rows;
  const summary = { sources: due.length, pagesChecked: 0, changed: 0, failed: 0 };
  for (const s of due) {
    await db.query(`UPDATE sources SET last_attempt_at=$2 WHERE id=$1`, [s.id, now]);
    const http = deps.httpFor?.(s) ?? createPoliteHttp({ ratePerMinute: s.rate_limit_per_minute });
    const hashes = { ...(s.config.hashes ?? {}) };
    const errors: string[] = [];
    for (const url of s.config.pageUrls ?? []) {
      const res = await http.get(url, { accept: ["text/html", "application/xhtml+xml"] });
      summary.pagesChecked++;
      if (res.kind === "not_modified") continue;
      if (res.kind !== "ok") {
        errors.push(`${url}: ${res.kind === "disallowed" ? res.reason : res.kind === "error" ? res.error : res.kind === "missing" ? `HTTP ${res.status}` : res.kind}`);
        continue;
      }
      const h = sha256(visibleText(res.body));
      if (hashes[url] === h) continue;
      const firstSeen = !hashes[url];
      hashes[url] = h;
      // One open submission per page: don't stack duplicates while a previous change awaits review.
      const open = await db.query(`SELECT 1 FROM submissions WHERE url=$1 AND status IN ('received','fetching','in_review','awaiting_verification') LIMIT 1`, [url]);
      if (open.rowCount) continue;
      await db.query(`INSERT INTO submissions (kind, url, submitter_note) VALUES ('url', $1, $2)`,
        [url, `Watched page ${firstSeen ? "added" : "changed"}: ${s.name} (source ${s.key}). Check the details against the page before publishing.`]);
      summary.changed++;
    }
    if (errors.length) {
      summary.failed++;
      // Failure never advances freshness (Invariant 3).
      await db.query(`UPDATE sources SET consecutive_failures = consecutive_failures + 1, last_errors = $2::jsonb, config = config || jsonb_build_object('hashes', $3::jsonb) WHERE id=$1`,
        [s.id, JSON.stringify(errors.slice(0, 5).map((e) => ({ at: now.toISOString(), error: e }))), JSON.stringify(hashes)]);
      deps.log("watch_failed", { source: s.key, errors });
    } else {
      await db.query(`UPDATE sources SET last_success_at=$2, consecutive_failures=0, config = config || jsonb_build_object('hashes', $3::jsonb) WHERE id=$1`, [s.id, now, JSON.stringify(hashes)]);
    }
  }
  deps.log("watch_pages_done", summary);
  return summary;
}
