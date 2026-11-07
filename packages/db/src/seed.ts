import { addDays, todayIn, type CandidateInput } from "@ff/core";
import type pg from "pg";
import { ingestCandidate } from "./ingest";

/**
 * SYNTHETIC demo data. Every record is is_synthetic=true, shows a DEMO DATA badge, and is
 * excluded from sitemaps, structured data, alerts and public counts. Names, organizers and
 * venues are invented placeholders and deliberately labeled "Demo" so they can never be
 * mistaken for a real program. Refuses to run in production (Invariant 2).
 */
export function assertSeedAllowed(nodeEnv = process.env.NODE_ENV, appEnv = process.env.APP_ENV) {
  if (nodeEnv === "production" || appEnv === "production") throw new Error("Refusing to seed synthetic data with NODE_ENV/APP_ENV=production");
}

const CITIES: [string, number, number][] = [
  ["Plano", 33.0198, -96.6989], ["Frisco", 33.1507, -96.8236], ["Allen", 33.1032, -96.6706], ["McKinney", 33.1972, -96.6398],
  ["Dallas", 32.7767, -96.797], ["Fort Worth", 32.7555, -97.3308], ["Arlington", 32.7357, -97.1081], ["Richardson", 32.9483, -96.7299],
  ["Garland", 32.9126, -96.6389], ["Irving", 32.814, -96.9489], ["Prosper", 33.2362, -96.8011], ["Grapevine", 32.9343, -97.0781],
  ["Denton", 33.2148, -97.1331], ["Southlake", 32.9412, -97.1342], ["Carrollton", 32.9756, -96.89], ["Lewisville", 33.0462, -96.9942],
];

// Deterministic PRNG so the demo dataset is stable across runs.
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

export function buildSyntheticCandidates(today: string): CandidateInput[] {
  const rand = rng(42);
  const out: CandidateInput[] = [];
  const names = ["Prairie Cup", "Lone Star Flag Bash", "Bluebonnet Classic", "Trinity Shootout", "Red River Showcase", "Pecan Bowl", "Mesquite Invitational", "Live Oak Cup"];
  for (let i = 0; i < 40; i++) {
    const [city, lat, lon] = CITIES[i % CITIES.length]!;
    const isLeague = i % 5 === 0;
    const start = addDays(today, 2 + Math.floor(rand() * 85));
    const end = isLeague ? addDays(start, 56) : addDays(start, rand() < 0.4 ? 1 : 0);
    const mappable = i % 9 !== 4; // some events intentionally lack coordinates
    const feeKnown = i % 4 !== 3;
    const girls = i % 3 === 0;
    const basis = i % 2 === 0 ? "per_team" : "per_player";
    const divisions: CandidateInput["divisions"] = [];
    const bands: [number, number][] = [[8, 9], [10, 12], [13, 15]];
    bands.forEach(([a, b], k) => {
      const cutoff = k === 1 && i % 2 === 1;
      divisions.push({
        name: `${girls ? "Girls" : "Coed"} ${cutoff ? `${b}U` : `${a}–${b}`}`,
        genderCategory: girls ? "girls" : "coed",
        genderLabelOriginal: girls ? "Girls" : "Coed",
        levelCategory: "youth",
        ageRuleType: cutoff ? "age_under" : "age_range",
        ageMin: cutoff ? null : a, ageMax: b,
        ageCutoffDate: cutoff ? `${start.slice(0, 4)}-08-31` : null,
        eligibilityOriginal: cutoff ? `${b}U (age as of Aug 31, ${start.slice(0, 4)})` : `Ages ${a}–${b} on game day`,
        format: i % 2 ? "5v5" : "7v7",
        competitionLevel: (["recreational", "competitive", "elite", "unknown"] as const)[i % 4],
        gameGuarantee: isLeague ? 8 : i % 3 === 2 ? null : 3,
        feeAmountMinor: feeKnown ? (basis === "per_team" ? 25000 + k * 2500 : 4500 + k * 500) : null,
        feeCurrency: feeKnown ? "USD" : null,
        pricingBasis: feeKnown ? basis : "unknown",
      });
    });
    if (i % 7 === 0) divisions.push({ name: "High School Girls", genderCategory: "girls", levelCategory: "high_school", ageRuleType: "grade", gradeMin: 9, gradeMax: 12, eligibilityOriginal: "Grades 9–12", format: "7v7" });
    out.push({
      externalId: `demo-${i}`,
      url: `https://demo.invalid/events/${i}`,
      name: `DEMO ${names[i % names.length]} — ${city}${isLeague ? " League" : ""}`,
      organizer: { name: `Demo Organizer ${String.fromCharCode(65 + (i % 6))}`, websiteUrl: null },
      series: { name: `DEMO ${names[i % names.length]} ${city}`, editionLabel: start.slice(0, 4) },
      eventType: isLeague ? "league" : i % 11 === 6 ? "clinic" : "tournament",
      sportScope: "flag",
      season: isLeague ? "Season (demo)" : null,
      startDate: start, endDate: end, timezone: "America/Chicago", datePrecision: "day",
      startTime: i % 3 === 0 ? "08:00" : null,
      registrationUrl: i % 6 === 5 ? null : `https://demo.invalid/register/${i}`,
      registrationDeadline: i % 3 === 1 ? addDays(today, 3 + (i % 20)) : null,
      registrationStatus: (["open", "unknown", "open", "closed", "waitlist", "not_yet_open"] as const)[i % 6],
      description: "Synthetic demo record for development. Not a real event.",
      venues: [{
        name: `Demo Field ${i % 5 + 1} (synthetic)`, addressLine1: null, locality: city, adminArea: "TX", postalCode: null, countryCode: "US",
        lat: mappable ? lat + (rand() - 0.5) * 0.06 : null, lon: mappable ? lon + (rand() - 0.5) * 0.06 : null,
        geoPrecision: mappable ? (i % 8 === 1 ? "city" : "street") : "unknown", geocodeProvider: mappable ? "synthetic" : null, geocodeLicense: mappable ? "synthetic" : null,
        indoorOutdoor: (["outdoor", "indoor", "unknown"] as const)[i % 3],
      }],
      divisions,
      sessions: isLeague ? [{ name: "Regular season", startDate: start, endDate: end, gameDays: ["Sat"], practiceSchedule: null }] : [],
    });
  }
  return out;
}

export async function ensureSyntheticSource(db: pg.Pool) {
  const r = await db.query(
    `INSERT INTO sources (key, name, url, connector_key, parser_version, coverage_regions, event_types, access_method, permission_notes, status, status_reason, is_synthetic, priority_bucket)
     VALUES ('demo-synthetic','DEMO synthetic data','https://demo.invalid/','synthetic','1','{dfw}','{tournament,league}','manual','Synthetic test data generated locally; not a real source.','enabled','Demo only — never shown in production', true, 'dfw')
     ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name RETURNING id, key, status, is_synthetic`);
  return r.rows[0] as { id: string; key: string; status: string; is_synthetic: boolean };
}

export async function seedSynthetic(db: pg.Pool, opts: { today?: string } = {}) {
  assertSeedAllowed();
  const source = await ensureSyntheticSource(db);
  const today = opts.today ?? todayIn("America/Chicago");
  let n = 0;
  for (const c of buildSyntheticCandidates(today)) {
    const o = await ingestCandidate(db, { source, candidate: c, parserVersion: "1" });
    if (o.kind === "rejected") throw new Error(`seed candidate rejected: ${o.reason}`);
    n++;
  }
  return n;
}
