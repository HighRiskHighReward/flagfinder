# Source access matrix

Evidence gathered **2026-11-07** (ZortsSports and iFlag re-checked **2026-11-08**). "Observed" means fetched live from the source. Items marked
*(search only)* were seen only in web-search results because the host was unreachable from the
build environment. Statuses are mirrored in the `sources` table (migrations `0005`, `0007`) and on
the public `/coverage` page.

**Summary:** No evaluated source currently permits automated republication of its event
listings. The three DFW city calendars publish iCal/RSS feeds, but their robots.txt files disallow
those exact paths. NFL FLAG and USA Football's terms prohibit republishing. The live path for a
city calendar is built and tested (iCal connector, SSRF-safe fetcher, robots.txt, ETag), but no
source is set to `enabled`. **Organizer submissions are the only live real-data intake today.**

## Preference order applied
Official API → partner feed → structured data (JSON-LD, iCal, RSS, sitemaps) → permitted static
HTML → browser rendering (not used). A source's robots.txt and terms are read before it is enabled,
and when a source has no robots.txt, that is not treated as permission.

## Matrix

| Source | Canonical URL | Coverage / types (observed) | Access method | Permission basis (checked 2026-11-07) | Status | Decision / what unlocks more |
|---|---|---|---|---|---|---|
| City of Frisco Parks & Recreation calendar | https://www.friscotexas.gov/calendar.aspx | Frisco; adult flag leagues spring & fall *(search only)* | iCal / RSS exist (CivicPlus) | **robots.txt observed**: `User-agent: *` → `Disallow: /common/modules/icalendar/`, `Disallow: /RSS.aspx`, `/rss.aspx` (the RSS lines carry the comment "added 2026-10-21"), `Crawl-delay: 10`. A named group for AI/SEO crawlers also disallows `/calendar.aspx` and `/RSSFeed.aspx`. Terms not read. | `blocked` | Built: generic iCal connector (`ical-1.0.0`) with fixtures and tests. The connector refuses disallowed paths (tested against the recorded robots excerpt). **Unlock:** written permission from the City of Frisco to read the calendar feed, recorded in `permission_notes`, then an admin sets `feedUrl` and enables the source. |
| City of Grapevine Parks & Recreation calendar | https://grapevinetexas.gov/iCalendar.aspx | Grapevine; 8v8 and 4v4 flag leagues *(search only)* | iCal (CivicPlus) | robots.txt observed: same CivicPlus rules as Frisco. | `blocked` | Same as Frisco. |
| Dallas Park & Recreation — NFL FLAG page | https://dallasparks.org/186/NFL-Flag-Football | Dallas youth NFL FLAG program *(search only)* | Static HTML (no structured data observed) | robots.txt observed: same CivicPlus rules. Program pages are not disallowed for `*`, but no event data or feed was found. | `blocked` | **Unlock:** city permission, plus a structured feed. |
| iFlag / USA Flag (FFWCT affiliates) | https://iflag.org/ | National tournaments, incl. an Arlington, TX event on 2026-11-21 *(search only)* | WordPress; feed/JSON-LD unverified | robots.txt (re-read 2026-11-08): `Disallow: /` only for AhrefsBot, SemrushBot, MJ12bot, Moz, rogerbot. Terms (https://iflag.org/terms/, read 2026-11-08) cover privacy, waivers and SMS; **no clause on automated access or republishing found**. Listings are static HTML at `/sanctioned-tournaments/` and `/tournaments/<slug>/`; JSON-LD is only WebSite/Organization (no Event), no iCal. | `pending_permission` | Technically permitted and not prohibited. **Next:** courtesy permission email, then a static-HTML connector with attribution, crawl delay and link-back. |
| NFL FLAG league finder | https://nflflag.com/find-league | National ZIP finder (interactive) | No public API or feed observed | robots.txt returns **404**. Terms (https://nflflag.com/terms), §License: *"These Terms permit you to use the Services solely for your personal or internal business use. You must not reproduce, distribute, modify, create derivative works of, publicly display, publicly perform, republish, download, store or transmit any of the material…"* | `blocked` | **Unlock:** partner agreement with NFL FLAG / RCX Sports. |
| USA Football (League Finder / tournaments & events) | https://usafootball.com/tournaments-events | National. The homepage banner observed "NATIONS CUP 2026 \| DEC. 10–12 \| FRISCO, TX". | HTML; event finder on `eventfinder.usafootball.com` (host not allowed, unread) | robots.txt observed: `User-Agent: *` → `Allow: /`, `Disallow: /private/`. Terms (https://usafootball.com/legal-terms-of-use): *"…license to view this Site and its Content … for non-commercial purposes only. No other permission is granted … you may not: use the materials for any commercial purpose, or for any public display (commercial or noncommercial)…"* | `blocked` | **Unlock:** USA Football's prior written approval (the terms reference "prior written approval of USAFB"). |
| ZortsSports | https://www.zortssports.com/ | Tournament check-in/management platform; tournament pages behind login (`/tournaments` → `/home/auth`) | None public | **Observed 2026-11-08.** robots.txt returns 404 (not permission). Terms (https://www.zortssports.com/terms, rendered by script): *"j. You will not deep link to the Services or access the Services manually or with any robot, spider, web crawler, extraction software, automated process and/or device to scrape, copy or monitor any portion of the Services…"* and *"e. You will not copy or distribute any content displayed through the Services."* | `blocked` | **Unlock:** written partnership/API agreement with Zorts (App-Order, LLC). A member's login does not change this; automating with it would breach the same terms. |
| FlagFootballX | — | One 2015 reference only *(search only)* | — | No current domain found. | not registered | Treated as unsupported until a current site is found. |
| IFAF | https://americanfootball.sport/ | International championships | — | Not evaluated further (no DFW events). | `unsupported` | International expansion later, through the same connector contract. |
| ACTIVE Network / ActiveKids | https://www.active.com/ | Hosts Plano and Fort Worth city flag programs *(search only)* | Commercial registration platform | Terms not reviewed; listings belong to their customers. | `blocked` (provisional) | **Unlock:** partner or API arrangement. |
| LeagueApps, TeamSnap, SportsEngine | leagueapps.com, teamsnap.com, sportsengine.com | — | Commercial platforms | Terms not reviewed. SportsEngine excerpt *(search only)*: "limited, revocable … for internal use". | `blocked` (provisional) | **Unlock:** partner or API arrangement. |
| Facebook Pages | https://graph.facebook.com/ | — | Official Graph API | Reading Pages you don't manage needs the Page Public Content Access feature, which requires App Review and Business Verification *(Meta docs via search)*. | `pending_credentials` | Built: feature flag `FEATURE_FACEBOOK_PAGES` (off) and public post URL submission with moderation. **Unlock:** a Meta app plus App Review. **GAP:** the OAuth Page connection flow is not implemented (see LIMITATIONS). |
| Facebook Groups | — | — | — | The Groups API was deprecated in Graph v19.0 and removed for all versions on **2024-04-22** *(Meta changelog via search)*. | `unsupported` | Not possible. Group posts can still be submitted as links; content that can't be read is marked `awaiting_verification`. |
| Licensed web search API | — | — | Search API | Not configured (`SEARCH_API_PROVIDER=none`). | `pending_credentials` | **GAP:** adapter not implemented. Discovery comes only from registered sources and submissions. |
| **Organizer submissions** | /submit | DFW first; any region | Manual / moderated | Organizers and community members submit public URLs or flyers. The worker fetches URLs with SSRF protection and robots.txt checks, and every item is moderated before it's published. | **`enabled`** | Live. This is the pilot path for DFW programs, including the product owner's own. |

## Recorded evidence in the repo
- `packages/connectors/fixtures/recorded/robots/civicplus-user-agent-star-excerpt.txt`: verbatim
  `User-agent: *` group observed identically on the three city hosts (excerpt, see `.meta.json`).
- All other fixtures are **synthetic** and labeled as such (`packages/connectors/fixtures/README.md`).

## How to enable a source once permission exists
1. Record the permission (who granted it, when, and the scope) in the source's `permission_notes`.
2. Admin → Sources: set `feedUrl` (or `pageUrls`), the cadence and the rate limit, then set the status to `enabled`.
   Enabling a source requires permission notes; the API refuses otherwise.
3. The scheduler picks it up on its next tick, at the source's deterministic offset within the hour.
4. Watch `/admin#queue` for the first run, then check `/coverage`.
