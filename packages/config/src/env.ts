import { z } from "zod";

/**
 * Env schema, validated at boot. Optional integrations never stall the platform:
 * each missing one is reported with what it would unlock.
 */
const optional = z.string().trim().min(1).optional();

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Deployment environment. Next.js forces NODE_ENV=production for any build, so production-only
   *  behavior keys off APP_ENV (defaults to NODE_ENV). Set APP_ENV=production in real deployments. */
  APP_ENV: z.enum(["development", "test", "staging", "production"]).optional(),
  DATABASE_URL: z.string().url().default("postgres://flagfinder:flagfinder@localhost:5432/flagfinder"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: optional,
  // Maps
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: optional,
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: optional,
  MAPKIT_TEAM_ID: optional,
  MAPKIT_KEY_ID: optional,
  MAPKIT_PRIVATE_KEY: optional,
  // Geocoding / routing / search
  GEOCODER_PROVIDER: z.enum(["none", "google", "apple"]).default("none"),
  ROUTING_PROVIDER: z.enum(["none", "google"]).default("none"),
  SEARCH_API_PROVIDER: z.enum(["none", "brave"]).default("none"),
  SEARCH_API_KEY: optional,
  // LLM extraction
  ANTHROPIC_API_KEY: optional,
  LLM_MODEL: z.string().default("claude-opus-5-5"),
  LLM_MONTHLY_BUDGET_USD: z.coerce.number().nonnegative().default(25),
  LLM_MAX_TOKENS_PER_CALL: z.coerce.number().int().positive().default(2000),
  // Email
  EMAIL_TRANSPORT: z.enum(["outbox", "smtp", "production"]).default("outbox"),
  SMTP_URL: optional,
  EMAIL_FROM: z.string().default("FlagFinder <alerts@flagfinder.example>"),
  // Facebook (feature-flagged, pending permission)
  FEATURE_FACEBOOK_PAGES: z.enum(["on", "off"]).default("off"),
  META_APP_ID: optional,
  META_APP_SECRET: optional,
  // Ops
  SENTRY_DSN: optional,
  SOURCE_FAILURE_ALERT_THRESHOLD: z.coerce.number().int().positive().default(5),
  STORAGE_DIR: z.string().default(".data/uploads"),
  NEXT_PUBLIC_MAP_PROVIDER: z.enum(["auto", "google", "apple", "none", "test-dom"]).default("auto"),
  SHOW_DEMO_DATA: z.enum(["on", "off"]).default("on"),
  SCHEDULER_TICK_SECONDS: z.coerce.number().int().min(10).default(60),
  SCHEDULER_HOURLY_CAPACITY: z.coerce.number().int().min(1).default(120),
});

export type Env = z.infer<typeof envSchema> & { appEnv: "development" | "test" | "staging" | "production" };

export interface IntegrationStatus {
  name: string;
  configured: boolean;
  unlocks: string;
  fallback: string;
}

let cached: Env | undefined;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  const env: Env = { ...parsed.data, appEnv: parsed.data.APP_ENV ?? parsed.data.NODE_ENV };
  if (env.appEnv === "production" && env.NEXT_PUBLIC_MAP_PROVIDER === "test-dom") {
    throw new Error("NEXT_PUBLIC_MAP_PROVIDER=test-dom is a test-only renderer and is refused in production.");
  }
  if (env.appEnv === "production" && !env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET is required in production.");
  }
  if (source === process.env) cached = env;
  return env;
}

export function integrationStatuses(env: Env): IntegrationStatus[] {
  return [
    { name: "Google Maps", configured: !!env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, unlocks: "Embedded Google map", fallback: "List view plus Open in Google/Apple Maps links; no embedded map" },
    { name: "Apple MapKit JS", configured: !!(env.MAPKIT_TEAM_ID && env.MAPKIT_KEY_ID && env.MAPKIT_PRIVATE_KEY), unlocks: "Embedded Apple map (JWT signed server-side)", fallback: "Google map if configured, otherwise list + directions links" },
    { name: "Geocoding", configured: env.GEOCODER_PROVIDER !== "none", unlocks: "Coordinates for venues that publish only an address", fallback: "Venues without published coordinates are listed as 'no mappable location'" },
    { name: "Routing", configured: env.ROUTING_PROVIDER !== "none", unlocks: "Travel times", fallback: "Straight-line distance, labeled as such" },
    { name: "Web search API", configured: env.SEARCH_API_PROVIDER !== "none" && !!env.SEARCH_API_KEY, unlocks: "Discovery of indexed public pages", fallback: "Discovery limited to registered sources and submissions" },
    { name: "LLM extraction", configured: !!env.ANTHROPIC_API_KEY, unlocks: "AI-assisted extraction for unstructured posts and flyers", fallback: "Unstructured submissions go to manual review" },
    { name: "Email (production)", configured: env.EMAIL_TRANSPORT === "production" && !!env.SMTP_URL, unlocks: "Real alert emails", fallback: "Alerts are written to the dev outbox (or Mailpit via SMTP_URL)" },
    { name: "Facebook Pages", configured: env.FEATURE_FACEBOOK_PAGES === "on" && !!env.META_APP_ID && !!env.META_APP_SECRET, unlocks: "Organizer-authorized Page connections", fallback: "Public post URL submission + moderation; status pending_permission" },
    { name: "Error reporting", configured: !!env.SENTRY_DSN, unlocks: "Sentry-compatible error reports", fallback: "Errors logged as structured JSON only" },
  ];
}

export function resetEnvCache() {
  cached = undefined;
}
