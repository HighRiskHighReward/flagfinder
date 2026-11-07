import type pg from "pg";
import { loadEnv } from "@ff/config";
import { brand } from "@ff/config/brand";
import { parseSearchState } from "@ff/core";
import { searchEvents } from "@ff/db";
import { createEmailTransport, type EmailTransport } from "@ff/providers/email";
import type { Logger } from "./log";

/**
 * Alerts: material changes to saved events + new matches for saved searches.
 * Double opt-in (confirmed_at), frequency (instant/daily/weekly/off), one-click unsubscribe,
 * duplicate suppression (unique dedupe_key), digest when many changes. Synthetic events never alert.
 */
export async function processAlerts(db: pg.Pool, log: Logger, opts: { transport?: EmailTransport; now?: Date; baseUrl?: string } = {}) {
  const env = loadEnv();
  const now = opts.now ?? new Date();
  const base = opts.baseUrl ?? env.APP_BASE_URL;
  const transport = opts.transport ?? createEmailTransport(env, db);

  // 1) Queue deliveries for material changes since the cursor.
  const cursor = Number((await db.query(`SELECT value FROM app_settings WHERE key='alerts_cursor'`)).rows[0]?.value ?? 0);
  const changes = await db.query(
    `SELECT c.id, c.event_id, c.field, c.old_value, c.new_value, e.name, e.slug
     FROM event_changes c JOIN events e ON e.id=c.event_id
     WHERE c.id > $1 AND c.material AND NOT e.is_synthetic AND e.publish_state='published' ORDER BY c.id`, [cursor]);
  let queued = 0;
  for (const ch of changes.rows) {
    const subs = await db.query(`SELECT user_id FROM favorites WHERE event_id=$1 AND alerts`, [ch.event_id]);
    for (const s of subs.rows) {
      const r = await db.query(`INSERT INTO alert_deliveries (user_id, dedupe_key, kind, event_id, payload) VALUES ($1,$2,'event_change',$3,$4) ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
        [s.user_id, `change:${ch.id}`, ch.event_id, JSON.stringify({ name: ch.name, slug: ch.slug, field: ch.field, old: ch.old_value, new: ch.new_value })]);
      queued += r.rowCount ?? 0;
    }
  }
  const maxId = changes.rows.at(-1)?.id;
  if (maxId) await db.query(`INSERT INTO app_settings (key, value) VALUES ('alerts_cursor', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify(Number(maxId))]);

  // 2) New matches for saved searches.
  const searches = await db.query(`SELECT * FROM saved_searches WHERE alerts`);
  for (const s of searches.rows) {
    const since: Date = s.last_run_at ?? s.created_at;
    const res = await searchEvents(db, parseSearchState(new URLSearchParams(s.query)), { showSynthetic: false, now });
    for (const r of res.results.filter((x) => !x.isSynthetic && new Date(x.discoveredAt) > since)) {
      const ins = await db.query(`INSERT INTO alert_deliveries (user_id, dedupe_key, kind, event_id, payload) VALUES ($1,$2,'new_match',$3,$4) ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
        [s.user_id, `match:${s.id}:${r.id}`, r.id, JSON.stringify({ name: r.name, slug: r.slug, search: s.name })]);
      queued += ins.rowCount ?? 0;
    }
    await db.query(`UPDATE saved_searches SET last_run_at=$2 WHERE id=$1`, [s.id, now]);
  }

  // 3) Send per user according to frequency.
  const users = await db.query(
    `SELECT u.id, u.email, p.frequency, p.unsubscribe_token,
            (SELECT max(sent_at) FROM alert_deliveries d WHERE d.user_id=u.id AND d.status='sent') AS last_sent
     FROM "user" u JOIN alert_preferences p ON p.user_id=u.id
     WHERE p.confirmed_at IS NOT NULL AND p.unsubscribed_at IS NULL AND p.frequency <> 'off'
       AND EXISTS (SELECT 1 FROM alert_deliveries d WHERE d.user_id=u.id AND d.status='pending')`);
  let sent = 0;
  for (const u of users.rows) {
    const gap = u.frequency === "instant" ? 0 : u.frequency === "daily" ? 24 * 3600_000 : 7 * 24 * 3600_000;
    if (u.last_sent && now.getTime() - new Date(u.last_sent).getTime() < gap) continue;
    const pending = (await db.query(`SELECT id, kind, payload FROM alert_deliveries WHERE user_id=$1 AND status='pending' ORDER BY id`, [u.id])).rows;
    const lines = pending.map((p) => p.kind === "event_change"
      ? `• ${p.payload.name}: ${String(p.payload.field).replace(/_/g, " ")} changed — ${base}/events/${p.payload.slug}`
      : `• New match for “${p.payload.search}”: ${p.payload.name} — ${base}/events/${p.payload.slug}`);
    const digest = pending.length > 5 || u.frequency !== "instant";
    const subject = digest ? `${brand.name}: ${pending.length} updates` : pending[0].kind === "event_change" ? `${brand.name}: ${pending[0].payload.name} changed` : `${brand.name}: new event match`;
    const text = `${lines.join("\n")}\n\nAlways confirm details with the organizer before you register or travel.\n\nUnsubscribe instantly: ${base}/api/alerts/unsubscribe?token=${u.unsubscribe_token}\nManage alerts: ${base}/account`;
    await transport.send({ to: u.email, subject, text });
    await db.query(`UPDATE alert_deliveries SET status='sent', sent_at=$2 WHERE id = ANY($1)`, [pending.map((p) => p.id), now]);
    sent++;
  }
  log("alerts_processed", { queued, emailsSent: sent });
  return { queued, sent };
}
