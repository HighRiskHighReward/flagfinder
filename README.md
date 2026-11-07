# FlagFinder

Find your next flag football tournament or league, with trustworthy details, a useful map, and information that stays current. DFW first.

## Run it locally (≤10 commands)
```bash
git clone <repo> flagfinder && cd flagfinder
pnpm install
docker compose up -d                     # Postgres+PostGIS (5432) and Mailpit (8025); or a local Postgres 16 + PostGIS
cp .env.example .env && cp .env.example apps/web/.env.local
pnpm db:migrate
pnpm db:seed                             # SYNTHETIC demo data only (refuses in production)
pnpm build && pnpm start                 # web on http://localhost:3000  (or: pnpm dev)
pnpm worker                              # second terminal: long-running worker
pnpm scheduler                           # third terminal: long-running scheduler
```

## Verify
```bash
pnpm typecheck && pnpm lint && pnpm test   # unit + integration (uses flagfinder_test DB)
pnpm test:e2e                              # Playwright (starts web with the test-only map renderer)
pnpm demo:verify                           # §14 completion demo (fresh DB, worker+scheduler without web, browser checks)
```

Grant yourself admin after signing up: `pnpm --filter @ff/db grant-role you@example.com admin` → `/admin`.

## Docs
- [CLAUDE.md](CLAUDE.md): invariants, layout, commands · [PROGRESS.md](PROGRESS.md): status
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DECISIONS.md](docs/DECISIONS.md) · [docs/SOURCE_ACCESS.md](docs/SOURCE_ACCESS.md)
- [docs/DESIGN.md](docs/DESIGN.md) · [docs/RUNBOOK.md](docs/RUNBOOK.md) · [docs/LIMITATIONS.md](docs/LIMITATIONS.md) · [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md)

**Data honesty:** demo events are synthetic and badged "DEMO DATA". No real organizer's event is invented. Real listings come only from permitted sources and moderated submissions.
