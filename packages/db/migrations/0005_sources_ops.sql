-- Scheduler guarantees + ops tables + the real source registry (evidence in docs/SOURCE_ACCESS.md).

-- A (source, job type, window) runs at most once, even under concurrent triggers.
CREATE UNIQUE INDEX ingestion_runs_window_once ON ingestion_runs (source_id, job_type, window_key)
  WHERE window_key IS NOT NULL AND status IN ('running','succeeded');

CREATE TABLE dead_letters (
  id         bigserial PRIMARY KEY,
  queue      text NOT NULL,
  payload    jsonb NOT NULL,
  attempts   int NOT NULL,
  last_error text NOT NULL,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);

CREATE TABLE scheduler_heartbeats (
  process    text PRIMARY KEY,
  beat_at    timestamptz NOT NULL,
  details    jsonb NOT NULL DEFAULT '{}'
);

-- Real candidate sources as evaluated on 2026-11-07. robots_checked_at stays NULL: robots.txt
-- could not be fetched from the build environment (network policy), so nothing is enabled
-- for automated fetching except organizer submissions.
INSERT INTO sources (key, name, url, connector_key, parser_version, coverage_regions, event_types, access_method, permission_notes, tos_url, status, status_reason, config, priority_bucket, refresh_cadence_minutes, rate_limit_per_minute, supports_conditional) VALUES
 ('organizer-submissions', 'Organizer submissions', 'https://flagfinder.example/submit', 'submission', '1', '{dfw,us,intl}', '{tournament,league,clinic}', 'manual',
  'Organizers and community members submit public URLs or flyers; every item is moderated before publishing.', NULL, 'enabled', 'Moderated submissions', '{}', 'dfw', 60, 60, false),
 ('frisco-parks-calendar', 'City of Frisco Parks & Recreation calendar', 'https://www.friscotexas.gov/calendar.aspx', 'ical', 'ical-1.0.0', '{frisco,dfw}', '{league}', 'ical',
  'Public municipal calendar with Subscribe/RSS controls (seen in search results 2026-11-07). robots.txt and feed URL not yet read: host blocked by build-environment network policy.', NULL,
  'pending_permission', 'Feed URL and robots.txt not yet verified (host unreachable from build environment)',
  '{"feedUrl": null, "timezone": "America/Chicago", "countryCode": "US", "adminArea": "TX", "organizerName": "City of Frisco Parks & Recreation", "organizerUrl": "https://www.friscotexas.gov", "knownLocalities": ["Frisco"], "includeKeywords": ["flag football", "flag"]}', 'dfw', 60, 6, true),
 ('grapevine-parks-calendar', 'City of Grapevine Parks & Recreation calendar', 'https://grapevinetexas.gov/iCalendar.aspx', 'ical', 'ical-1.0.0', '{grapevine,dfw}', '{league}', 'ical',
  'iCalendar subscription page observed in search results (2026-11-07); whether flag football appears in it is unverified.', NULL,
  'pending_permission', 'Feed contents and robots.txt not yet verified (host unreachable from build environment)',
  '{"feedUrl": null, "timezone": "America/Chicago", "countryCode": "US", "adminArea": "TX", "organizerName": "City of Grapevine Parks & Recreation", "knownLocalities": ["Grapevine"], "includeKeywords": ["flag football", "flag"]}', 'dfw', 60, 6, true),
 ('dallas-parks-flag', 'Dallas Park & Recreation — NFL FLAG program page', 'https://dallasparks.org/186/NFL-Flag-Football', 'jsonld', 'jsonld-1.0.0', '{dallas,dfw}', '{league}', 'static_html',
  'Program page observed in search results; no structured feed observed. robots.txt unread.', NULL, 'pending_permission', 'No structured data observed; robots.txt unread', '{"pageUrls": [], "timezone": "America/Chicago", "countryCode": "US"}', 'dfw', 360, 2, true),
 ('iflag-tournaments', 'iFlag / USA Flag tournament listings (FFWCT affiliates)', 'https://iflag.org/', 'jsonld', 'jsonld-1.0.0', '{us,dfw}', '{tournament}', 'static_html',
  'Tournament listings observed in search results (e.g. an Arlington, TX event). Terms and robots.txt unread.', NULL, 'pending_permission', 'Terms and robots.txt unread; host unreachable from build environment', '{"pageUrls": [], "timezone": "America/Chicago", "countryCode": "US"}', 'us', 360, 2, true),
 ('nfl-flag-finder', 'NFL FLAG league finder', 'https://nflflag.com/find-league', 'none', '0', '{us}', '{league}', 'manual',
  'Interactive ZIP finder; no public feed/API observed. Would require a partner agreement.', NULL, 'pending_permission', 'Partner feed/agreement required', '{}', 'us', 1440, 1, false),
 ('usa-football-league-finder', 'USA Football League Finder', 'https://leaguefinder.usafootball.com/', 'none', '0', '{us}', '{league}', 'manual',
  'League directory (not events). No feed observed; terms unread.', NULL, 'pending_permission', 'Directory of leagues, no feed; terms unread', '{}', 'us', 1440, 1, false),
 ('zortssports', 'ZortsSports', 'https://www.zortssports.com/', 'none', '0', '{us}', '{tournament}', 'manual',
  'Domain could not be verified from the build environment; no search results confirmed listings.', NULL, 'pending_permission', 'Domain and listings unverified', '{}', 'us', 1440, 1, false),
 ('ifaf', 'IFAF (International Federation of American Football)', 'https://americanfootball.sport/', 'none', '0', '{intl}', '{tournament}', 'manual',
  'International championships only; no DFW events.', NULL, 'unsupported', 'No DFW-relevant events; international expansion later', '{}', 'intl', 1440, 1, false),
 ('active-network', 'ACTIVE Network / ActiveKids listings', 'https://www.active.com/', 'none', '0', '{us,dfw}', '{league,clinic}', 'manual',
  'Commercial registration platform hosting city programs (e.g. Plano, Fort Worth). Terms not reviewed; listings belong to customers.', NULL, 'blocked', 'Commercial platform — needs partner/API arrangement; not scraped', '{}', 'dfw', 1440, 1, false),
 ('leagueapps', 'LeagueApps', 'https://leagueapps.com/', 'none', '0', '{us}', '{league,tournament}', 'manual', 'Commercial platform; terms not reviewed.', NULL, 'blocked', 'Commercial platform — needs partner/API arrangement', '{}', 'us', 1440, 1, false),
 ('teamsnap', 'TeamSnap', 'https://www.teamsnap.com/', 'none', '0', '{us}', '{league}', 'manual', 'Commercial platform; terms not reviewed.', NULL, 'blocked', 'Commercial platform — needs partner/API arrangement', '{}', 'us', 1440, 1, false),
 ('sportsengine', 'SportsEngine', 'https://www.sportsengine.com/', 'none', '0', '{us}', '{league}', 'manual', 'Commercial platform; license excerpt says "limited, revocable … for internal use".', NULL, 'blocked', 'Commercial platform — needs partner/API arrangement', '{}', 'us', 1440, 1, false),
 ('facebook-pages', 'Facebook Pages (organizer-authorized)', 'https://graph.facebook.com/', 'facebook-pages', '0', '{dfw,us}', '{tournament,league}', 'official_api',
  'Page Public Content Access requires Meta App Review and Business Verification. Organizer-authorized connections are behind FEATURE_FACEBOOK_PAGES.', 'https://developers.facebook.com/terms/', 'pending_credentials', 'Meta app + App Review required', '{}', 'dfw', 360, 1, false),
 ('facebook-groups', 'Facebook Groups', 'https://www.facebook.com/groups/', 'none', '0', '{}', '{}', 'manual',
  'Groups API deprecated in Graph API v19.0 and removed for all versions on 2024-04-22.', NULL, 'unsupported', 'Groups API removed by Meta (2024-04-22)', '{}', 'dfw', 1440, 1, false);
