# Progress

_Last updated: 2026-11-07. Read CLAUDE.md first._

## Stage status
| Stage | Status | Gate evidence |
|---|---|---|
| 1. Foundation & discovery UX | **Done** | E2E journey "girls 10–12 near Plano, next 30 days" ✔; map/list sync ✔; URL state ✔; axe both themes, mobile + desktop ✔ |
| 2. Real ingestion & submissions | **Partially done** | Submission → moderation → publish ✔ (worker tests, demo step 4). **Real permitted connector: NOT live**: every evaluated source disallows automated access or needs permission (SOURCE_ACCESS.md). Live path proven with synthetic fixtures over real HTTP. |
| 3. Durable operations | **Done** | Scheduler + worker run with web stopped ✔ (demo 7); changed source updates without duplicate ✔ (demo 5, worker test); forced failure leaves freshness ✔ (demo 6); admin dashboard + audit log ✔; coverage page ✔ |
| 4. Accounts & planning | **Done (with notes)** | Alert fires for material change to saved event ✔ (outbox catcher + local SMTP sink; Mailpit itself not runnable in sandbox); planner conflict warnings ✔ (unit); auth, favorites, saved searches, double opt-in, unsubscribe, calendar, ICS, compare, claims ✔ |
| 5. Coverage expansion | **Not started** | Blocked on permissions. Connector contract + iCal/JSON-LD connectors ready. |

## Verified
- `pnpm typecheck` ✔ · `pnpm lint` ✔ · `pnpm test` 202/202 ✔ · `pnpm test:e2e` 42/42 ✔ · `pnpm demo:verify` 9 PASS / 1 PENDING / 0 FAIL

## Open issues / gaps
See docs/LIMITATIONS.md. Main ones: no live real source; Google/Apple map adapters untested with real keys; Facebook OAuth flow, search API, geocoding and routing adapters not built; strings not yet extracted for i18n.

## Next concrete action
Ask the City of Frisco and City of Grapevine Parks & Recreation (and/or USA Football) for written permission to read their calendar feeds. Once granted: record it in `permission_notes`, allow the host in the environment, set `feedUrl`, enable the source in Admin, and re-run `pnpm demo:verify` so criterion 3 can pass on real data. In parallel, pilot organizer submissions with the product owner's own North Texas program.
