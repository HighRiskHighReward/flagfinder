# Test results

Run on 2026-11-07 in the build sandbox (Ubuntu 24.04, Node 22.23, Postgres 16.15 + PostGIS 3, Chromium via Playwright 1.63).

## Summary
| Suite | Command | Result |
|---|---|---|
| Typecheck (all packages + scripts) | `pnpm typecheck` | pass (exit 0) |
| Lint | `pnpm lint` | pass (exit 0) |
| Unit + integration (Vitest, real Postgres `flagfinder_test`) | `pnpm test` | **202 passed / 0 failed / 0 skipped** (19 files) |
| End-to-end (Playwright, desktop 1366×900 + Pixel 7) | `pnpm test:e2e` | **42 passed / 0 failed / 0 skipped** |
| Completion demo | `pnpm demo:verify` | **9 PASS · 1 PENDING · 0 FAIL** (criterion 3 pending: no permitted real source) |

## Unit/integration by file
| File | Tests | Covers (§12) |
|---|---|---|
| packages/db/test/ingest.test.ts | 21 | Invariant 6 trigger, synthetic quarantine, change tracking (venue change → history + material), explicit cancellation, 404 → source_missing only, failed fetch leaves freshness, cross-source dedup keeps both provenance records, editions/weekends separate, flag-only scope (tackle rejected, mixed keeps flag divisions), unknown fee never 0, ambiguous → review, venue identity, merge/unmerge, append-only audit |
| packages/db/test/search.test.ts | 10 | girls 10–12 near Plano, cutoff "possible" matches, default DFW upcoming soonest, date overlap (multi-day before range + league session), unmapped count, synthetic exclusion, unknown prices sort last, bbox, radius + straight-line labels, SQL/TS eligibility parity grid |
| packages/core/test/* | 52 | flyer dates ("3/4", "Sat the 14th", cross-month → review), eligibility ("Ages 10–12" ≠ "12U cutoff Aug 31"), DST weekend / all-day / non-US tz, fees (unknown ≠ $0; per-player vs per-team), freshness state machine, dedup thresholds, status evidence, verification never organizer_confirmed from fetch, backoff/Retry-After/token bucket, URL state, ICS, planner conflicts |
| packages/connectors/test/connectors.test.ts | 14 | iCal + JSON-LD fixture parsing stable, DTEND exclusive, DST wall time, injected text inert, robots longest-match, **recorded real robots.txt excerpt** blocks iCal/RSS, SSRF (private/loopback/metadata/mapped IPv6, DNS-resolved private, redirect to metadata IP, redirect cap, size cap, content-type), polite HTTP (robots disallow, 429 Retry-After, 304, 404) |
| apps/worker/test/worker.test.ts | 15 | real fetch path → published with source links; changed source updates without duplicate + logs change; 304 = success; dropped from feed → source_missing; **forced failure leaves freshness**; parser-version re-parse without duplicates or network; **concurrent triggers run once**; **full-jitter backoff**; **429 respects Retry-After**; **dead-letter after max attempts**; circuit breaker + alert; non-enabled sources never fetched; robots disallow; planner offsets/budget; review sweep; **alert for a material change to a saved event, deduped, unconfirmed users excluded** |
| apps/worker/test/submissions.test.ts | 3 | URL submission → in_review → moderator publish with source link; unreadable link → awaiting_verification (nothing guessed); **no LLM key → manual review**; `.invalid` placeholder can't satisfy Invariant 6 |
| apps/worker/test/pgboss.test.ts | 1 | real pg-boss accepts every option shape the worker sends |
| packages/providers/test/* | 12 | production email transport refuses outside production; SMTP only to local catcher; outbox default; magic-byte uploads reject SVG/HTML/EXE/oversize; EXIF strip; **prompt injection**: delimiter escape neutralized, extra fields ("verification_level") rejected by strict schema, extraction always requires moderation; SMTP delivery to a local catcher |
| apps/web/test/unit/contrast.test.ts | 71 | every text/background pair in both themes; gold-on-white never used as text |
| apps/web/test/unit/fallbacks.test.ts | 3 | no map keys → no embedded map; provider selection; test renderer refused in production |

## End-to-end (both projects: desktop + mobile)
- journey: girls 10–12 near Plano, next 30 days; key facts above the fold on the event page
- map/list sync: pin count = "N on map" = mappable list items; pins + cluster sizes account for every pin; pin click/tap highlights and scrolls to card; card hover highlights pin
- "Search this area": appears after moving the map, URL unchanged until clicked, then list and map update from one query
- URL state: shared URL reproduces identical results; back/forward/refresh preserve state
- axe (wcag2a/aa, 21aa, 22aa): **no serious/critical violations** on home, results, coverage, event page, light and dark, desktop and mobile (screenshots in `artifacts/`)
- keyboard skip link; persisted theme override
- authorization: anonymous → 401 and signed-in non-admin → 403 on **every** admin action (`ADMIN_ACTIONS`) and `/admin`
- cross-origin POST rejected; non-http submission URL and SVG-as-PNG upload rejected; XSS payload in event name renders as text, no script execution

## Performance (lab, measured — not field data)
`node scripts/perf.cjs http://localhost:3000` → `artifacts/perf.json`. Conditions: Playwright Chromium, Pixel 7 emulation, CPU 4× slowdown, 150 ms RTT, 1.6 Mbps down / 750 Kbps up, production build served from localhost, local Postgres, synthetic demo data (40 events), median of 3 runs. INP is approximated as the longest Event Timing interaction duration for one tap.

| Page | LCP | CLS | INP (approx.) |
|---|---|---|---|
| Home / results list (mobile) | 532 ms | 0.005 | 112 ms (tap "Girls flag" chip) |
| Results: girls 10–12 near Plano | 508 ms | 0 | 104 ms (tap "Map") |
| Event page | 508 ms | 0 | not measured |

Caveats: no CDN or real network distance, small dataset, LCP element is text. Re-measure in staging with real data before claiming targets. Search query plan: `docs/SEARCH_EXPLAIN.md`.

## Not covered / skipped
- Google Maps and Apple MapKit adapters: not run (no keys). Map E2E uses the test-only renderer.
- Mailpit binary could not be installed in the sandbox; alerts verified via the outbox catcher and a local SMTP sink test.
- Real-source ingestion: no permitted source (see SOURCE_ACCESS.md).
