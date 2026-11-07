import { z } from "zod";
import { audit, mergeEvents, moderatorEdit, publishEvent, refreshVerification, rejectEvent, unmergeEvents, withTx } from "@ff/db";
import { db } from "@/lib/server";
import { requireRole } from "@/lib/auth-server";
import { sameOrigin } from "@/lib/request";
import { ADMIN_ACTIONS, ADMIN_ONLY, type AdminAction } from "@/lib/admin-actions";

const uuid = z.string().uuid();
const schemas: Record<AdminAction, z.ZodType> = {
  publish: z.object({ eventId: uuid, adminVerified: z.boolean().optional(), sourceUrl: z.string().url().nullable().optional() }),
  reject: z.object({ eventId: uuid, reason: z.string().min(3).max(500) }),
  edit: z.object({ eventId: uuid, patch: z.object({ name: z.string().min(2).max(250).optional(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), registrationUrl: z.string().url().nullable().optional(), sportScope: z.enum(["flag", "mixed", "tackle", "7v7_passing_non_flag", "unknown"]).optional() }) }),
  merge: z.object({ survivorId: uuid, mergedId: uuid }),
  unmerge: z.object({ mergeId: uuid }),
  "dedup-distinct": z.object({ candidateId: uuid }),
  "resolve-review": z.object({ id: uuid, status: z.enum(["resolved", "dismissed"]) }),
  "resolve-conflict": z.object({ conflictId: uuid, note: z.string().max(500).optional() }),
  correction: z.object({ id: uuid, status: z.enum(["applied", "dismissed"]) }),
  claim: z.object({ id: uuid, decision: z.enum(["approved", "rejected"]) }),
  "source-update": z.object({ sourceId: uuid, paused: z.boolean().optional(), refreshCadenceMinutes: z.number().int().min(15).max(10080).optional(), rateLimitPerMinute: z.number().int().min(1).max(60).optional(),
    status: z.enum(["enabled", "pending_credentials", "pending_permission", "blocked", "unsupported"]).optional(), permissionNotes: z.string().min(10).max(2000).optional(), feedUrl: z.string().url().optional() })
    .refine((v) => v.status !== "enabled" || !!v.permissionNotes, "Enabling a source requires recorded permission notes"),
  budget: z.object({ dfw: z.number().min(0).max(1), us: z.number().min(0).max(1), intl: z.number().min(0).max(1) }).refine((b) => Math.abs(b.dfw + b.us + b.intl - 1) < 0.001, "Weights must sum to 1"),
  "dead-letter-resolve": z.object({ id: z.number().int() }),
  "set-role": z.object({ userId: z.string().min(1), role: z.enum(["user", "organizer", "moderator", "admin"]) }),
  reparse: z.object({ sourceId: uuid }),
};

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const action = (await params).action as AdminAction;
  // Authorization first, on every request — before validating or revealing anything.
  const user = await requireRole(req, ADMIN_ONLY.includes(action) ? "admin" : "moderator");
  if (user instanceof Response) return user;
  if (!ADMIN_ACTIONS.includes(action)) return Response.json({ error: "Unknown action" }, { status: 404 });
  if (!sameOrigin(req)) return Response.json({ error: "Bad origin" }, { status: 403 });
  const parsed = schemas[action].safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  // Validated by the action's zod schema above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = parsed.data as any;
  const actor = user.email;
  const pool = db();
  try {
    switch (action) {
      case "publish": await publishEvent(pool, p.eventId, actor, { adminVerified: p.adminVerified, sourceUrl: p.sourceUrl }); break;
      case "reject": await rejectEvent(pool, p.eventId, actor, p.reason); break;
      case "edit": await moderatorEdit(pool, p.eventId, actor, p.patch); break;
      case "merge": await mergeEvents(pool, p.survivorId, p.mergedId, actor); break;
      case "unmerge": await unmergeEvents(pool, p.mergeId, actor); break;
      case "dedup-distinct":
        await pool.query(`UPDATE dedup_candidates SET status='distinct', decided_at=now() WHERE id=$1`, [p.candidateId]);
        await audit(pool, actor, "dedup_distinct", "dedup_candidate", p.candidateId); break;
      case "resolve-review":
        await pool.query(`UPDATE review_items SET status=$2, resolved_at=now(), resolved_by=$3 WHERE id=$1`, [p.id, p.status, actor]);
        await audit(pool, actor, `review_${p.status}`, "review_item", p.id); break;
      case "resolve-conflict":
        await pool.query(`UPDATE conflicts SET status='resolved', resolved_at=now() WHERE id=$1`, [p.conflictId]);
        await audit(pool, actor, "resolve_conflict", "conflict", p.conflictId, { note: p.note ?? null }); break;
      case "correction":
        await pool.query(`UPDATE corrections SET status=$2 WHERE id=$1`, [p.id, p.status]);
        await pool.query(`UPDATE review_items SET status='resolved', resolved_at=now(), resolved_by=$2 WHERE ref_id=$1 AND kind='correction'`, [p.id, actor]);
        await audit(pool, actor, `correction_${p.status}`, "correction", p.id); break;
      case "claim":
        await withTx(pool, async (tx) => {
          const c = (await tx.query(`UPDATE organizer_claims SET status=$2, decided_at=now(), decided_by=$3 WHERE id=$1 RETURNING *`, [p.id, p.decision, actor])).rows[0];
          if (c && p.decision === "approved") {
            await tx.query(`UPDATE "user" SET role='organizer' WHERE id=$1 AND role='user'`, [c.user_id]);
            for (const ev of c.confirmed_event_ids) await refreshVerification(tx, ev);
          }
          await audit(tx, actor, `claim_${p.decision}`, "organizer_claim", p.id);
        }); break;
      case "source-update":
        await pool.query(
          `UPDATE sources SET paused=COALESCE($2,paused), refresh_cadence_minutes=COALESCE($3,refresh_cadence_minutes), rate_limit_per_minute=COALESCE($4,rate_limit_per_minute),
             status=COALESCE($5::source_status,status), permission_notes=COALESCE($6,permission_notes), config = CASE WHEN $7::text IS NULL THEN config ELSE jsonb_set(config,'{feedUrl}',to_jsonb($7::text)) END WHERE id=$1`,
          [p.sourceId, p.paused ?? null, p.refreshCadenceMinutes ?? null, p.rateLimitPerMinute ?? null, p.status ?? null, p.permissionNotes ?? null, p.feedUrl ?? null]);
        await audit(pool, actor, "source_update", "source", p.sourceId, p); break;
      case "budget":
        await withTx(pool, async (tx) => {
          for (const b of ["dfw", "us", "intl"] as const) await tx.query(`UPDATE crawl_budget SET weight=$2 WHERE bucket=$1`, [b, p[b]]);
          await audit(tx, actor, "budget_update", "crawl_budget", null, p);
        }); break;
      case "dead-letter-resolve":
        await pool.query(`UPDATE dead_letters SET resolved_at=now(), resolved_by=$2 WHERE id=$1`, [p.id, actor]);
        await audit(pool, actor, "dead_letter_resolved", "dead_letter", String(p.id)); break;
      case "set-role":
        await pool.query(`UPDATE "user" SET role=$2 WHERE id=$1`, [p.userId, p.role]);
        await audit(pool, actor, "set_role", "user", p.userId, { role: p.role }); break;
      case "reparse":
        // The worker performs the re-parse; the web app only records the request (picked up by the scheduler).
        await pool.query(`UPDATE sources SET config = jsonb_set(config, '{reparseRequestedAt}', to_jsonb(now()::text)) WHERE id=$1`, [p.sourceId]);
        await audit(pool, actor, "reparse_requested", "source", p.sourceId); break;
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
  return Response.json({ ok: true });
}

export async function GET(req: Request) {
  const user = await requireRole(req, "moderator");
  if (user instanceof Response) return user;
  return Response.json({ error: "Use POST" }, { status: 405 });
}
