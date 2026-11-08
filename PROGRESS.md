# Progress

_Last updated: 2026-11-08. Read CLAUDE.md first._

## Stage status
| Stage | Status | Gate evidence |
|---|---|---|
| 1. Foundation & discovery UX | **Done** | E2E journey "girls 10–12 near Plano, next 30 days" ✔; map/list sync ✔; URL state ✔; axe both themes, mobile + desktop ✔ |
| 2. Real ingestion & submissions | **Done (one real source)** | Submission → moderation → publish ✔. **iFlag connector live** (ADR-023): tested on recorded real pages; local end-to-end run on 2026-11-08 ingested 8 real tournaments (7 published, 1 to review), and a DFW search returned ATX Bowl (Arlington). Production runs it daily on Render. Other sources need permission (docs/OUTREACH.md). |
| 3. Durable operations | **Done** | Scheduler + worker run with web stopped ✔ (demo 7); changed source updates without duplicate ✔ (demo 5, worker test); forced failure leaves freshness ✔ (demo 6); admin dashboard + audit log ✔; coverage page ✔ |
| 4. Accounts & planning | **Done (with notes)** | Alert fires for material change to saved event ✔ (outbox catcher + local SMTP sink; Mailpit itself not runnable in sandbox); planner conflict warnings ✔ (unit); auth, favorites, saved searches, double opt-in, unsubscribe, calendar, ICS, compare, claims ✔ |
| 5. Coverage expansion | **In progress** | 2026-11-08: 15 DFW organizers evaluated (SOURCE_ACCESS.md). Enabled: iFlag (`iflag`), Fathers & Football (`jsonld`), Gridiron DFW and Frisco Football League (watched pages, ADR-025). Blocked/pending with outreach drafted: Zorts, i9, RISE, Lone Star SSC, Flag 50, PremierEventsUSA, NFL FLAG, USA Football, city calendars. |

## Verified
- `pnpm typecheck` ✔ · `pnpm lint` ✔ · `pnpm test` 202/202 ✔ · `pnpm test:e2e` 42/42 ✔ · `pnpm demo:verify` 9 PASS / 1 PENDING / 0 FAIL

## Open issues / gaps
See docs/LIMITATIONS.md. Main ones: no live real source; Google/Apple map adapters untested with real keys; Facebook OAuth flow, search API, geocoding and routing adapters not built; strings not yet extracted for i18n.

## Deployment
Live at https://flagfinder.onrender.com (Render free plan + Supabase free, ADR-022). Framer homepage buttons point to it.

## Next concrete action
**Now:** send the outreach emails in docs/OUTREACH.md; the owner adds `ANTHROPIC_API_KEY` in Render to switch on flyer reading; approve the Lonestar Shootout in Admin.
**Earlier plan:** Ask the City of Frisco and City of Grapevine Parks & Recreation (and/or USA Football) for written permission to read their calendar feeds. Once granted: record it in `permission_notes`, allow the host in the environment, set `feedUrl`, enable the source in Admin, and re-run `pnpm demo:verify` so criterion 3 can pass on real data. In parallel, pilot organizer submissions with the product owner's own North Texas program.
