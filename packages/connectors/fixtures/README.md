# Connector fixtures

**All fixtures in this directory are SYNTHETIC.** They were hand-written to exercise the
parsers against the published format specifications (RFC 5545 iCalendar, schema.org Event
JSON-LD). They were **not** captured from any real organization's website, and their
contents (names, venues, dates) are invented and marked "SYNTHETIC".

Why: the build environment's network policy blocked every candidate source host
(see `docs/SOURCE_ACCESS.md`), so no real response could be recorded. When a source is
verified, add a recorded capture next to these as `<source-key>/<capture-date>.<ext>`
with a `.meta.json` containing `{ "sourceUrl", "capturedAt", "robotsCheckedAt", "httpStatus" }`.
