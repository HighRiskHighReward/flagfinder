import type pg from "pg";
import { createPoliteHttp, extractJsonLd, jsonLdConnector, type PoliteHttp } from "@ff/connectors";
import { ingestCandidate, openReview, type SourceRow } from "@ff/db";
import { extractionToCandidate, LocalPrivateStorage, type ExtractionProvider } from "@ff/providers";
import type { Logger } from "./log";

/**
 * Organizer submissions (URL or flyer) → extraction → moderation. Runs in the worker only
 * (Invariant 9). Nothing is published here; every item lands in the moderation queue.
 * Unreadable content keeps the link, is marked awaiting_verification, and is never guessed.
 */
export async function processSubmission(db: pg.Pool, id: string, deps: { http?: PoliteHttp; llm: ExtractionProvider; storageDir: string; log: Logger; timezone?: string }) {
  const s = (await db.query(`UPDATE submissions SET status='fetching', updated_at=now() WHERE id=$1 AND status='received' RETURNING *`, [id])).rows[0];
  if (!s) return { skipped: true };
  const source = (await db.query<SourceRow>(`SELECT id, key, status, is_synthetic FROM sources WHERE key='organizer-submissions'`)).rows[0]!;
  const tz = deps.timezone ?? "America/Chicago";
  const finish = async (status: string, extra: { extraction?: unknown; method?: string; eventId?: string | null; reason?: string }) => {
    await db.query(`UPDATE submissions SET status=$2, extraction=COALESCE($3, extraction), extraction_method=COALESCE($4, extraction_method), event_id=COALESCE($5, event_id), updated_at=now() WHERE id=$1`,
      [id, status, extra.extraction ? JSON.stringify(extra.extraction) : null, extra.method ?? null, extra.eventId ?? null]);
    await openReview(db, { kind: "submission", eventId: extra.eventId ?? null, refId: id, reason: extra.reason ?? `Submission ${status}` });
    deps.log("submission_processed", { submissionId: id, status, method: extra.method });
    return { status };
  };
  const ingest = async (cands: Parameters<typeof ingestCandidate>[1]["candidate"][], method: string, extraction: unknown) => {
    let eventId: string | null = null;
    for (const c of cands) {
      const o = await ingestCandidate(db, { source, candidate: c, parserVersion: method, autoPublish: false });
      if (o.kind === "created" || o.kind === "updated" || o.kind === "unchanged" || o.kind === "attached") eventId ??= o.eventId;
    }
    return finish("in_review", { extraction, method, eventId, reason: eventId ? "Submission extracted; needs moderator review" : "Submission content could not be mapped to an event" });
  };

  if (s.kind === "flyer") {
    const up = (await db.query(`SELECT * FROM uploads WHERE id=$1`, [s.upload_id])).rows[0];
    if (!up || up.mime === "application/pdf" || !deps.llm.extractImage) return finish("in_review", { method: "manual", reason: "Flyer needs manual transcription (no automated reader for this file)" });
    const buf = await new LocalPrivateStorage(deps.storageDir).get(up.storage_key);
    const r = await deps.llm.extractImage(buf, up.mime);
    if (r.status !== "extracted") return finish("in_review", { method: "manual", reason: r.reason });
    const sourceUrl = s.url ?? `https://flyer.invalid/${id}`; // placeholder; moderator must attach a real source URL before publishing (Invariant 6)
    return ingest([extractionToCandidate(r.extraction, sourceUrl, 0.8, tz)], `llm:${r.model}`, r.extraction);
  }

  const http = deps.http ?? createPoliteHttp({ ratePerMinute: 6 });
  const res = await http.get(s.url, { accept: ["text/html", "application/xhtml+xml"] });
  if (res.kind !== "ok") {
    const why = res.kind === "disallowed" ? res.reason : res.kind === "missing" ? `HTTP ${res.status}` : res.kind === "error" ? res.error : res.kind;
    return finish("awaiting_verification", { method: "none", reason: `Couldn't read the link (${why}). Link kept; contents not guessed.` });
  }
  const ctx = { config: { pageUrls: [s.url], timezone: tz, countryCode: "US" }, now: new Date() };
  if (extractJsonLd(res.body).length) {
    const cands = await jsonLdConnector.normalize(await jsonLdConnector.parse(res, ctx), ctx);
    if (cands.length) return ingest(cands.map((c) => ({ ...c, url: s.url, ambiguities: [...(c.ambiguities ?? []), { field: "submission", reason: "submitted_url_requires_moderation", evidence: null }] })), "jsonld-1.0.0", { jsonld: true });
  }
  const text = res.body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 20_000);
  const r = await deps.llm.extract(text, s.kind === "post_url" ? "post" : "page_text");
  if (r.status !== "extracted") return finish("in_review", { method: "manual", reason: r.reason });
  return ingest([extractionToCandidate(r.extraction, s.url, 0.8, tz)], `llm:${r.model}`, r.extraction);
}

export async function processPendingSubmissions(db: pg.Pool, deps: Parameters<typeof processSubmission>[2]) {
  const ids = (await db.query<{ id: string }>(`SELECT id FROM submissions WHERE status='received' ORDER BY created_at LIMIT 20`)).rows;
  for (const { id } of ids) await processSubmission(db, id, deps).catch((e) => deps.log("submission_failed", { submissionId: id, error: (e as Error).message }));
  return ids.length;
}
