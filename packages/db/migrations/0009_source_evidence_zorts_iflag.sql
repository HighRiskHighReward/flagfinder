-- Evidence gathered live on 2026-11-08 (see docs/SOURCE_ACCESS.md for quotes).
UPDATE sources SET status='blocked', robots_checked_at='2026-11-08', tos_url='https://www.zortssports.com/terms',
  status_reason='Terms forbid robots/crawlers/scraping and copying content; tournament pages require login. Unlock: written partnership/API agreement with Zorts (App-Order, LLC).',
  permission_notes='robots.txt returns 404 (2026-11-08) — absence of robots is not permission. Terms: "j. You will not deep link to the Services or access the Services manually or with any robot, spider, web crawler, extraction software, automated process and/or device to scrape, copy or monitor any portion of the Services"; "e. You will not copy or distribute any content displayed through the Services." /tournaments redirects to /home/auth (login). Using a member login to automate would also violate these terms.'
WHERE key='zortssports';

UPDATE sources SET robots_checked_at='2026-11-08', tos_url='https://iflag.org/terms/',
  status_reason='robots.txt allows general agents; terms (2026-11-08) contain no clause on automated access or republishing; listings are static HTML (no Event JSON-LD, no iCal). Courtesy permission request recommended before enabling.',
  permission_notes='robots.txt: Disallow / only for AhrefsBot, SemrushBot, MJ12bot, Moz, rogerbot. Terms page read 2026-11-08: covers privacy, waivers, SMS; no scraping/republishing restriction found. Listing pages: /sanctioned-tournaments/, /tournaments/<slug>/. JSON-LD present but only WebSite/Organization types.'
WHERE key='iflag-tournaments';
