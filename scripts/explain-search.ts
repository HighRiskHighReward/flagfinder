/** Records EXPLAIN ANALYZE for the main search query into docs/SEARCH_EXPLAIN.md. Usage: pnpm tsx scripts/explain-search.ts */
import { writeFileSync } from "node:fs";
import pg from "pg";
import { parseSearchState } from "../packages/core/src/search-state";
import { searchEvents } from "../packages/db/src/search";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://flagfinder:flagfinder@localhost:5432/flagfinder" });
const qs = "region=plano&gender=girls&ageMin=10&ageMax=12&chips=next30";
let plan = "";
const t0 = performance.now();
const r = await searchEvents(db, parseSearchState(new URLSearchParams(qs)), { showSynthetic: true, explain: (p) => { plan = p; } });
const ms = performance.now() - t0;
const counts = (await db.query(`SELECT (SELECT count(*) FROM events)::int AS events, (SELECT count(*) FROM divisions)::int AS divisions, (SELECT count(*) FROM venues)::int AS venues`)).rows[0];
writeFileSync("docs/SEARCH_EXPLAIN.md", `# Main search query — EXPLAIN ANALYZE

Recorded ${new Date().toISOString()} on the local dev database (${counts.events} events, ${counts.divisions} divisions, ${counts.venues} venues — synthetic demo data).
Query: \`/?${qs}\` → ${r.total} results. Wall time for explain + query + venue/division fetch: ${ms.toFixed(1)} ms.

At this size Postgres reasonably prefers sequential scans; the GiST indexes on \`events.during\`, \`league_sessions.during\`,
\`venues.location\` and the division filter index exist for larger datasets. Re-run this script after loading real
data at scale and revisit indexes before adding any search infrastructure.

\`\`\`
${plan}
\`\`\`
`);
console.log(`wrote docs/SEARCH_EXPLAIN.md (${r.total} results, ${ms.toFixed(1)} ms)`);
await db.end();
