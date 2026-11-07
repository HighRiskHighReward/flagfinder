import { loadEnv } from "@ff/config";
import { hitRateLimit } from "@ff/db";
import { checkUpload, LocalPrivateStorage, stripImageMetadata } from "@ff/providers/storage";
import { db } from "@/lib/server";
import { clientKey, sameOrigin } from "@/lib/request";
import { currentUser } from "@/lib/auth-server";

/**
 * Accepts a URL or flyer. The web process never fetches the URL (Invariant 9) — the worker does,
 * with SSRF protection and robots.txt checks. Files are type-sniffed, size-capped, metadata
 * stripped, and stored privately.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad origin" }, { status: 403 });
  const rl = await hitRateLimit(db(), `submissions:${clientKey(req)}`, 10, 3600);
  if (!rl.allowed) return Response.json({ error: "Too many submissions from this network. Try again later." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Invalid form" }, { status: 400 });
  if (String(form.get("website") ?? "")) return Response.json({ ok: true }); // honeypot
  if (form.get("noChildData") !== "on") return Response.json({ error: "Please confirm the submission contains no children's personal information." }, { status: 400 });
  const note = String(form.get("note") ?? "").slice(0, 1000) || null;
  const rawUrl = String(form.get("url") ?? "").trim();
  const file = form.get("flyer");
  const user = await currentUser(req.headers);

  let url: string | null = null;
  if (rawUrl) {
    try { const u = new URL(rawUrl); if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(); url = u.toString(); }
    catch { return Response.json({ error: "Enter a full web address starting with https://" }, { status: 400 }); }
  }
  let uploadId: string | null = null;
  if (file instanceof File && file.size > 0) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const chk = checkUpload(buf);
    if (!chk.ok) return Response.json({ error: chk.reason }, { status: 400 });
    const clean = stripImageMetadata(buf, chk.mime);
    const key = await new LocalPrivateStorage(loadEnv().STORAGE_DIR).put(clean, chk.mime.split("/")[1]!);
    uploadId = (await db().query(`INSERT INTO uploads (storage_key, mime, byte_size, sha256, original_name) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [key, chk.mime, clean.byteLength, chk.sha256, file.name.slice(0, 200)])).rows[0].id;
  }
  if (!url && !uploadId) return Response.json({ error: "Add a link or a flyer." }, { status: 400 });
  const kind = uploadId ? "flyer" : /facebook\.com|instagram\.com|x\.com|twitter\.com/i.test(url!) ? "post_url" : "url";
  const r = await db().query(`INSERT INTO submissions (kind, url, upload_id, submitter_user_id, submitter_note) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [kind, url, uploadId, user?.id ?? null, note]);
  return Response.json({ ok: true, id: r.rows[0].id });
}
