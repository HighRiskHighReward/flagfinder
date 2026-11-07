# Runbook

## Deploy
Three services against one managed Postgres with PostGIS and pg_trgm (e.g. Render, Fly, Railway, or AWS RDS / Cloud SQL, all of which offer PostGIS):
1. **Database:** create Postgres 16+, then `CREATE EXTENSION postgis; CREATE EXTENSION pg_trgm; CREATE EXTENSION pgcrypto;` (the first migration also runs these if the role is allowed to).
2. **Migrate** (release step): `pnpm db:migrate`. Migrations are forward-only SQL files in `packages/db/migrations`.
3. **Web:** `Dockerfile.web` runs `next start`. Scale horizontally; it's stateless (sessions live in the DB).
4. **Worker:** `Dockerfile.worker` runs `pnpm worker`. A long-running process; scale by adding instances (pg-boss distributes jobs).
5. **Scheduler:** the same image runs `pnpm scheduler`. Run **exactly one** instance. Duplicate schedulers are harmless thanks to per-window uniqueness, but they waste work.
Set `APP_ENV=production`, `AUTH_SECRET`, `DATABASE_URL`, `APP_BASE_URL`, and the email settings (`EMAIL_TRANSPORT=production`, `SMTP_URL`). **Never run `pnpm db:seed` in production**; it refuses to.
`render.paid.yaml` is a ready-made Render blueprint for this layout.

### Free tier ($0): one container + Supabase (ADR-022)
`render.yaml` deploys a single free Render web service from `Dockerfile.free`. At start, `scripts/start-all.sh` runs migrations, then runs the web app and the combined worker+scheduler (`pnpm background`) in the same container. Measured locally: about 310 MB RSS in total, which fits the 512 MB free instance.
1. **Supabase (free):** create a project. In Database → Extensions, enable `postgis` and `pg_trgm` (the migration also tries to). Copy the **Session pooler** connection string (IPv4; the direct host is IPv6-only) and append `?sslmode=no-verify`. That gives an encrypted connection, but it doesn't verify Supabase's private CA.
2. **Render:** New → Blueprint → this repo. Set `DATABASE_URL` (from step 1) and `APP_BASE_URL`. `AUTH_SECRET` is generated for you. `DB_POOL_MAX=3` keeps total connections at 12 or fewer (web pool, shared worker/scheduler pool, two pg-boss pools).
3. **Keep-alive (optional):** free Render services sleep after about 15 minutes idle, and free Supabase projects pause after a week without activity. A free uptime monitor (e.g. UptimeRobot) hitting `/api/health` every 5–10 minutes keeps the app awake. While it's awake, the scheduler queries the database every minute, which keeps Supabase active. One always-on service uses about 720 of Render's 750 free hours a month.
Free-tier limits: cold starts of roughly a minute after sleep; uploaded flyers go to local disk, which is wiped on every restart (GAP: object storage); no pre-deploy hook, so migrations run at boot.

## Health
- `GET /api/health`: liveness.
- `GET /api/ready`: database and queue readiness (503 until the worker has initialized the pg-boss schema).
- Admin → Process health: heartbeats from the `worker` and `scheduler` (every 30 s and every tick, respectively).
- Logs are structured JSON with a `correlationId` per job run; grep for that ID to follow a run end to end.

## Backups and restore
- Turn on the provider's automated daily backups with PITR (7–30 days).
- Logical backup: `pg_dump --format=custom --no-owner "$DATABASE_URL" > flagfinder-$(date +%F).dump`
- Restore into a fresh database: `createdb ff_restore && psql ff_restore -c 'CREATE EXTENSION postgis; CREATE EXTENSION pg_trgm; CREATE EXTENSION pgcrypto;' && pg_restore --no-owner -d ff_restore flagfinder-YYYY-MM-DD.dump`, then point `DATABASE_URL` at it and run `pnpm db:migrate` (a no-op if current).
- `raw_payloads` lets you re-parse after restoring without re-fetching (Admin → Sources → Re-parse).

## Rotating keys
- `AUTH_SECRET`: rotating it signs every user out. Deploy the new value to web only.
- Google Maps browser key: create a new key restricted to your HTTP referrers, deploy it, then delete the old key.
- MapKit: create a new key in the Apple Developer portal, update `MAPKIT_KEY_ID` and `MAPKIT_PRIVATE_KEY`, and redeploy web. Tokens are short-lived (30 min) and signed server-side.
- `ANTHROPIC_API_KEY`, `SMTP_URL`, `SEARCH_API_KEY`: update the secret and restart the worker (and web for SMTP).

## Pausing a source
Admin → Sources → **Pause** (audited). The scheduler skips paused sources immediately; in-flight jobs finish.
To stop all fetching in an emergency, scale the scheduler and worker to 0. The web app keeps serving cached data with its freshness labels.

## Handling a dead-letter spike
1. Admin → Queue: look at `dead_letters.last_error` and the source's `last_errors`.
2. If the errors are robots/403 "access not permitted": **pause the source**, re-read its robots.txt and terms, and update `docs/SOURCE_ACCESS.md`. Never work around a block.
3. 429s: lower the source's `rate_limit_per_minute` and raise its cadence.
4. Parse failures: fix the parser, bump `parserVersion`, then Admin → Re-parse (uses stored raw payloads, so no re-fetching).
5. Network outage: the circuit breaker opens after `SOURCE_FAILURE_ALERT_THRESHOLD` failures and closes automatically. Mark the dead letters resolved once the source recovers.

## Cost drivers (see LIMITATIONS.md)
Map loads (Google/Apple), geocoding, the LLM (per extraction; monthly breaker `LLM_MONTHLY_BUDGET_USD`), email volume and database size (`raw_payloads`).
