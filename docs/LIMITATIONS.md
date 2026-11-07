# Known limitations and gaps

## Not met / pending
- **No real source is live.** Every evaluated source disallows automated access (robots.txt) or its terms forbid republishing (see SOURCE_ACCESS.md). The full live path is built and tested end to end over real HTTP, but only against a local server serving *synthetic* fixtures. Organizer submissions are the live intake. Demo criterion 3 reports PENDING.
- **Recorded real fixtures:** only a robots.txt excerpt could be recorded. Host access was removed from the build environment before full captures could be retained.

## GAPs (code paths marked `// GAP:` or not built)
- **Facebook Pages OAuth connection:** only the feature flag, source registry entry and post-URL submission exist. The OAuth flow and Graph calls are not implemented (they need a Meta app and App Review to test).
- **Licensed web search API discovery:** env and integration status exist; no adapter yet.
- **Geocoding and routing providers:** not implemented. Venues without published coordinates are shown as "not on map", and distances are labeled "straight-line distance".
- **Google Maps and Apple MapKit adapters:** written against the providers' documented JS APIs but **never run against live keys** here. The map/list E2E tests use the test-only DOM renderer, which production refuses. The Google adapter uses `google.maps.Marker`; consider `AdvancedMarkerElement` with a Map ID.
- **OCR:** no local OCR engine. Flyers are read by the LLM's vision input when `ANTHROPIC_API_KEY` is set, otherwise they go to manual review. PDFs always go to manual review. Image metadata stripping is byte-level (EXIF/XMP/IPTC/text chunks), not a full re-encode.
- **Error reporting:** the Sentry-compatible hook logs JSON when `SENTRY_DSN` is set; there is no network transport.
- **Mailpit:** not available in the build sandbox (no Docker). Alerts were verified with the outbox catcher (`email_outbox` table). `docker-compose.yml` includes Mailpit; set `EMAIL_TRANSPORT=smtp SMTP_URL=smtp://localhost:1025`.
- **Organizer website-token claims:** the token is issued, but checking for it on the organizer's site is a manual moderator step.
- **Conflict resolution:** moderators mark conflicts resolved and edit fields manually; there's no one-click "accept proposed value".
- **Pagination:** a single result set capped at 500 (shown in the UI), revealed 25 at a time. There is no cursor pagination beyond 500 (ADR-007).
- **i18n:** strings are English-only and inline (not yet extracted to message catalogs). Currencies, timezones and units are international-ready in the schema and formatting.
- **Bot friction:** honeypot, rate limits and same-origin checks only; no CAPTCHA.
- **Performance:** lab measurements only (see TEST_RESULTS.md), against localhost with synthetic data, so no CDN, realistic data volume or field data.

- **Free-tier hosting (ADR-022):** the app sleeps when idle unless pinged; flyer uploads are lost on restart (no object storage yet); background jobs pause while asleep.

## Operating cost drivers
| Driver | Unit | Control |
|---|---|---|
| Google Maps JS / Apple MapKit | map loads | Lazy-loaded, list renders first; map loads only when the map is shown on mobile |
| Geocoding (when added) | per address | Cache only where the provider's terms allow; store provider and license with each coordinate |
| LLM extraction | per submission/post | Only for unstructured items; per-call token cap; monthly budget breaker (`LLM_MONTHLY_BUDGET_USD`) |
| Email | per alert | Digests (daily/weekly), duplicate suppression, double opt-in |
| Database | storage | `raw_payloads` grows with fetches (dedup by sha256); prune old payloads once re-parse needs are met |
| Worker egress | requests | Hourly target per source, conditional requests (304), robots crawl-delay, per-domain token bucket |
