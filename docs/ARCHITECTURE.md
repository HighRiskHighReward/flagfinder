# Architecture

The repository started empty, so the §9 default stack applies, with the deviations recorded in DECISIONS.md: SQL-first migrations instead of a Drizzle schema, and local Postgres instead of Docker in the build sandbox.

## Processes
```
            ┌───────────── web (Next.js, apps/web) ─────────────┐
 browser ──▶│ SSR pages · /api/* · admin · auth (Better Auth)  │── reads/writes ─┐
            │ NEVER fetches third-party URLs (Invariant 9)      │                 │
            └───────────────────────────────────────────────────┘                 ▼
                                                                         ┌──────────────────┐
 scheduler (apps/worker/src/scheduler.ts, long-running) ─ plans jobs ──▶ │ Postgres 16      │
   • per-source offset (hash mod 3600 s) + 0–60 s jitter, one run/window │  + PostGIS       │
   • bucket budget 60/25/15 (DB-editable) · pg-boss cron for sweeps      │  + pg_trgm       │
                                                                         │  + pg-boss queue │
 worker (apps/worker/src/worker.ts, long-running) ◀── jobs ───────────── │                  │
   • discover / refresh / deadline-check / review-sweep / alerts /       └──────────────────┘
     submissions / reparse queues, own concurrency
   • connectors → polite fetcher (robots, token bucket, ETag, SSRF guard)
```
The worker and scheduler need only the database; they keep running when the web app is stopped (demo step 7).

## Packages
- `packages/config`: `brand.ts` (the only place the product name lives) and a zod env schema (`loadEnv`, `integrationStatuses`). `APP_ENV` gates production-only behavior, because Next.js forces `NODE_ENV=production` for every build.
- `packages/core`: pure domain logic. Local-date and timezone math, the conservative flyer-date reader, eligibility (`matchAge`, in parity with SQL `ff_age_match`), fees, the freshness state machine, materiality hashing and diffs, dedup scoring and blocking, status evidence, verification levels, the canonical URL search state, the candidate schema, ICS export and planner conflicts.
- `packages/db`: SQL migrations, the ingest pipeline (`ingestCandidate`), search (`searchEvents`, a single result set for both map and list), the event detail query, admin operations (publish, reject, edit, merge and unmerge, audit), coverage, rate limits and the guarded synthetic seed.
- `packages/connectors`: the §9.3 contract, the SSRF-safe fetch (DNS-pinned undici dispatcher, redirect re-validation, size, time and content-type caps), robots.txt (RFC 9309), polite HTTP, and the generic iCal and schema.org JSON-LD connectors with fixtures.
- `packages/providers`: email (outbox catcher, local SMTP, and a production transport that refuses to start outside production), LLM extraction (Anthropic SDK, no tools, delimited untrusted data, zod-validated, budget breaker), MapKit JWT signing, and private upload storage with magic-byte sniffing and metadata stripping.
- `apps/web`: UI, API routes and admin. The map sits behind a `MapProvider` interface (Google and Apple adapters plus a test-only DOM renderer) with shared supercluster clustering.
- `apps/worker`: job runner (`runSourceJob`), planner, sweeps, alerts, submissions, and the worker and scheduler entrypoints.

## Data model highlights (see migrations)
- `events`: local `start_date`/`end_date` plus an IANA `timezone` (never UTC midnight), `date_precision`, and a generated `during daterange` with a GiST index. `status` values: scheduled, postponed, cancelled, source_missing, completed. `publish_state` and the four freshness timestamps are separate columns.
- `event_series` → `event_editions`. Editions are never merged (enforced in dedup and in `mergeEvents`).
- `divisions`: separate fee and eligibility per division. Constraints guarantee an unknown fee is NULL (never 0), a known amount carries a currency, and unknown capacity is never "available".
- `venues`: a geography point that cannot exist without `geocode_provider` and `geocode_license` (Invariant 10).
- `source_records`, `raw_payloads`, `field_provenance`, `conflicts`, append-only `event_changes`, `merges` (reversible), `review_items`, `dedup_candidates`, `ingestion_runs` (with a unique index for one run per window), `dead_letters`, `fetch_state` (ETag and Last-Modified validators), and append-only `audit_log`.
- Invariant 6 is a **deferred constraint trigger**: a published non-synthetic event must have an active source record with an http(s) URL that isn't on the reserved `.invalid` domain.

## Request flow: search
URL → `parseSearchState` (zod, invalid values dropped) → `resolveSearch` (DFW and upcoming defaults, quick chips) → one SQL query (date overlap on events or league sessions, region radius or locality, bbox, point radius, per-division filters including `ff_age_match`, best-match score) → the same `results[]` feeds both the list and the map pins, with the `total` and `mappable` counts shown.

## Ingestion flow
Scheduler → `refresh` job → `runSourceJob`: insert an `ingestion_runs` row (a unique window prevents duplicates) → discover → fetch (conditional) → store the raw payload → parse → normalize → `ingestCandidate` (upsert the source record; update or diff, create, or attach via dedup; provenance, verification, review items) → listings missing from a complete feed become `source_missing`. On failure, only `last_checked_at` moves; the job retries with full-jitter backoff or Retry-After, opens the circuit breaker, raises an alert, and dead-letters after the maximum attempts.

## Security
SSRF guard on every server-side fetch, a strict CSP, same-origin checks on mutating POSTs, DB-backed rate limits, honeypots, and server-side role checks on every admin request. External text is rendered only as React text (never `dangerouslySetInnerHTML`); JSON-LD output is `<`-escaped. Uploads are sniffed by magic bytes, size-capped, stripped of metadata and stored privately; PDFs are never parsed in the web process.
