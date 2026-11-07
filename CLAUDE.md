# FlagFinder — working memory (read first, then PROGRESS.md)

Full brief: `docs/MISSION.md`. Architecture: `docs/ARCHITECTURE.md`. Choices: `docs/DECISIONS.md`.

## Non-Negotiable Invariants (§0) — enforcement in brackets
1. Never fabricate. Unknown = null + `*_status='unknown'`. Missing price ≠ free; missing capacity ≠ spots available. [DB CHECKs `divisions_fee_known`, `divisions_capacity_known`, `events_deadline_known`; zod candidate schema]
2. Synthetic data quarantined: `is_synthetic=true`, DEMO DATA badge, excluded from sitemaps/JSON-LD/alerts/public counts. Seed throws if NODE_ENV=production. [`assertSeedAllowed`, trigger `source_records_synthetic_consistency`]
3. Failed fetch never refreshes freshness. Only success advances `last_success_at`; only material change advances `last_material_change_at`. [`core/freshness.ts`, `markEventCheckFailed`, tests]
4. Missing page ≠ cancellation → `source_missing` + review. Only explicit published evidence → cancelled/postponed. [`core/status.ts`, CHECK `events_status_evidence`]
5. Map and list come from ONE query result; UI shows "N events · M on map". [`searchEvents` returns both]
6. Every published real event links ≥1 source record with URL. [deferred constraint trigger `events_published_requires_source`]
7. External content is untrusted data. LLM calls get no tools; content in delimited data blocks; output zod-validated.
8. Respect robots/ToS/rate limits/auth walls. Never bypass logins/CAPTCHAs/anti-bot. Public ≠ permitted.
9. Third-party fetching only in the worker, never browser or web request.
10. Coordinates carry provider + license class; no Google coords on Apple maps or vice versa. [CHECK `venues_location_provenance`]
11. No children's data: no youth profiles/birthdates; eligibility vs published rules only.
12. No real email outside production (outbox/Mailpit); production transport refuses to init elsewhere.
13. Never claim more coverage than exists; /coverage computed from live data; no unmeasured claims.

## Stack
TypeScript strict · pnpm workspace · Next.js App Router · Tailwind v4 · Postgres 16 + PostGIS 3 + pg_trgm (SQL-first migrations, `pg` driver) · pg-boss · Better Auth · Vitest · Playwright (pinned 1.63 = preinstalled browser).

## Layout
- `apps/web` Next app (UI, API routes, admin) · `apps/worker` worker + scheduler entrypoints
- `packages/db` migrations (`migrations/*.sql`), ingest pipeline, search, seed (synthetic, guarded)
- `packages/core` pure domain: dates, eligibility, fees, freshness, dedup, status, verification, URL search state, candidate schema
- `packages/connectors` connector contract, safe fetcher (SSRF, robots, limiter), connectors + fixtures
- `packages/providers` maps (MapKit JWT), geocoding, llm-extraction, email, storage
- `packages/config` brand (`brand.ts` — only place the name lives), env schema (zod)

## Commands
```
pnpm install
pnpm typecheck          # all packages
pnpm lint
pnpm test               # vitest (uses flagfinder_test DB, reset per run)
pnpm test:e2e           # playwright (needs web running or starts it)
pnpm db:migrate         # apply SQL migrations
pnpm db:seed            # SYNTHETIC demo data (refuses in production)
pnpm db:reset           # drop + migrate (refuses in production)
pnpm dev                # web on :3000
pnpm worker             # long-running job worker
pnpm scheduler          # long-running scheduler
pnpm demo:verify        # §14 completion demo (needs a web build)
pnpm --filter @ff/db grant-role <email> admin   # make an admin after sign-up
node scripts/perf.cjs http://localhost:3000     # lab perf → artifacts/perf.json
pnpm tsx scripts/design-doc.ts                  # regenerate docs/DESIGN.md contrast table
pnpm tsx scripts/explain-search.ts              # regenerate docs/SEARCH_EXPLAIN.md
```
Env: production behavior keys off `APP_ENV` (Next builds always set NODE_ENV=production). E2E uses `NEXT_PUBLIC_MAP_PROVIDER=test-dom` (test-only, refused in production).
Local Postgres (no Docker in the build sandbox): `service postgresql start`; DBs `flagfinder`, `flagfinder_test`, user/pass `flagfinder`. Docker users: `docker compose up -d`.

## Status pointers
- Real sources: none enabled; evidence in docs/SOURCE_ACCESS.md. Organizer submissions are the live intake.
- Gaps: docs/LIMITATIONS.md. Stage status + next action: PROGRESS.md.

## Working rules
- Before every commit: typecheck, lint, relevant tests. Never commit red.
- Never mark stubbed/untested work done. Use `// GAP:` + PROGRESS.md.
- Ask the user only for blocking credentials or irreversible decisions; otherwise decide, log in DECISIONS.md.
