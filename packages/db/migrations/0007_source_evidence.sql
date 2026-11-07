-- Evidence gathered live on 2026-11-07 (see docs/SOURCE_ACCESS.md for quotes).
UPDATE sources SET status='blocked', robots_checked_at='2026-11-07',
  status_reason='robots.txt disallows /common/modules/icalendar/ and /RSS.aspx for all agents (crawl-delay 10); /calendar.aspx and /RSSFeed.aspx disallowed for search/aggregator bots. Unlock: written permission from the city.',
  permission_notes='robots.txt read 2026-11-07 (CivicPlus): User-agent * → Disallow /common/modules/icalendar/, /RSS.aspx, /rss.aspx; Crawl-delay 10. Named AI/SEO crawler group → also Disallow /calendar.aspx, /RSSFeed.aspx.'
WHERE key IN ('frisco-parks-calendar','grapevine-parks-calendar','dallas-parks-flag');

UPDATE sources SET status='blocked', robots_checked_at='2026-11-07', tos_url='https://nflflag.com/terms',
  status_reason='Terms permit "personal or internal business use" only and prohibit republishing. Unlock: partner agreement with NFL FLAG / RCX Sports.',
  permission_notes='robots.txt returns 404 (2026-11-07) — absence of robots is not permission. Terms §License: "You must not reproduce, distribute, modify, create derivative works of, publicly display, publicly perform, republish, download, store or transmit any of the material".'
WHERE key='nfl-flag-finder';

UPDATE sources SET status='blocked', robots_checked_at='2026-11-07', url='https://usafootball.com/tournaments-events', tos_url='https://usafootball.com/legal-terms-of-use',
  status_reason='Terms grant a view-only, non-commercial licence and prohibit public display of materials. Unlock: USA Football prior written approval.',
  permission_notes='robots.txt (2026-11-07): User-Agent * Allow / Disallow /private/ (crawl-delay 10 for some agents). Terms: licence "to view this Site and its Content … for non-commercial purposes only … you may not … use the materials for any commercial purpose, or for any public display".'
WHERE key='usa-football-league-finder';

UPDATE sources SET robots_checked_at='2026-11-07',
  status_reason='robots.txt (2026-11-07) blocks only SEO bots; site pages unreachable from build environment (egress gateway 403). Terms unread.',
  permission_notes='robots.txt observed once on 2026-11-07: Disallow / only for AhrefsBot, SemrushBot, MJ12bot, Moz, rogerbot.'
WHERE key='iflag-tournaments';
