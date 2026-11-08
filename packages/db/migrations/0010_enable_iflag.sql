-- ADR-023: enable the iFlag listings connector. Permission basis recorded 2026-11-08:
-- robots.txt allows general agents; terms contain no automated-access/republishing restriction.
-- Polite settings: once a day, at most 2 requests/minute, conditional requests, link back to iFlag.
UPDATE sources SET
  connector_key = 'iflag', parser_version = 'iflag-1.0.0', access_method = 'static_html',
  coverage_regions = '{us,dfw}', event_types = '{tournament}',
  url = 'https://iflag.org/sanctioned-tournaments/',
  config = '{"pageUrls": ["https://iflag.org/sanctioned-tournaments/", "https://iflag.org/tournaments/"], "timezone": "America/Chicago", "countryCode": "US"}',
  refresh_cadence_minutes = 1440, rate_limit_per_minute = 2, supports_conditional = true,
  status = 'enabled',
  status_reason = 'Enabled 2026-11-08 by owner decision (ADR-023): robots.txt permits, terms silent on automated access. Daily, 2 req/min, attributed with link-back. Courtesy notice sent to iFlag; disable immediately if iFlag objects.',
  permission_notes = permission_notes || ' | 2026-11-08: owner approved enabling. robots.txt allows *; terms (https://iflag.org/terms/) have no scraping/republishing clause. Courtesy email drafted in docs/OUTREACH.md.'
WHERE key = 'iflag-tournaments';
