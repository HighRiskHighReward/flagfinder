# Decision log (ADRs)

Each entry: decision · alternatives · why · reversibility.

**ADR-001 Monorepo with pnpm workspaces, TS source exports.** Packages export `src/*.ts` directly; Next transpiles them, worker runs via `tsx`. Alt: build step per package. Why: zero build orchestration. Reversible.

**ADR-002 Local Postgres instead of Docker in the build sandbox.** Docker daemon unavailable in the build environment; Postgres 16 + PostGIS 3 installed via apt. `docker-compose.yml` is still provided for developers. Reversible.

**ADR-003 SQL-first migrations + `pg` driver; Drizzle not adopted (deviation from §9.1 default).** PostGIS geography, generated daterange columns, deferred constraint triggers and plpgsql functions are clearer in SQL; a Drizzle schema would duplicate the source of truth. Queries are parameterized via `pg`. Alt: Drizzle schema + drizzle-kit. Reversible: Drizzle can be introduced with `drizzle-kit pull`.

**ADR-004 pg-boss for jobs.** Postgres-backed, no extra infra, supports singleton keys, retries with backoff, dead-letter queues, cron schedules. Alt: Graphile Worker. Reversible.

**ADR-005 TypeScript 6.0.3, not 7.x.** typescript-eslint 8.72 supports `<6.1`. Revisit when typescript-eslint supports TS 7.

**ADR-006 Playwright pinned to 1.63.0** to match the preinstalled Chromium in the build sandbox.

**ADR-007 Search returns up to 500 results in one result set; "page" reveals 25 at a time.** Guarantees map pins and list items come from the identical result set (Invariant 5) without a second query. Truncation is shown in the UI. Alt: cursor pagination with per-page pins (breaks "N on map" consistency). Reversible.

**ADR-008 Eligibility logic duplicated in SQL (`ff_age_match`) and TS (`matchAge`)** so search can filter/paginate in SQL; a parity test runs a grid of rules/ages through both.

**ADR-009 Unknown-value inclusion is explicit per filter (`unk=` URL param).** When a user picks a filter value, records with unknown/unpublished values are included only if "Unknown / not published" is ticked. Never silent.

**ADR-010 Girls/Boys filters do not auto-include coed divisions.** Coed must be selected explicitly. Rationale: a girls team typically wants girls divisions.

**ADR-011 Demo data visibility.** `SHOW_DEMO_DATA` (default on outside production, forced off in production) controls whether synthetic events appear in search; they always carry a DEMO DATA badge and are never in sitemaps, JSON-LD, alerts or public counts.

**ADR-012 Dedup: absent signals are neutral.** A missing registration URL or organizer scores 0.5 rather than 0 so that sparse records can still reach the review band. Editions/date windows are hard blocks.

**ADR-013 Gender "girls" chip = girls divisions only** (see ADR-010).
