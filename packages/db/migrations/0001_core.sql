-- FlagFinder core schema. SQL is the source of truth (see docs/DECISIONS.md ADR-003).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- enums ----------
CREATE TYPE event_type AS ENUM ('tournament','league','clinic','combine','other');
CREATE TYPE sport_scope AS ENUM ('flag','tackle','7v7_passing_non_flag','mixed','unknown');
CREATE TYPE date_precision AS ENUM ('exact','day','month','tbd');
CREATE TYPE event_status AS ENUM ('scheduled','postponed','cancelled','source_missing','completed');
CREATE TYPE publish_state AS ENUM ('draft','in_review','published','rejected','merged');
CREATE TYPE verification_level AS ENUM ('discovered_unverified','awaiting_verification','source_checked','multi_source_corroborated','organizer_confirmed','admin_verified');
CREATE TYPE registration_status AS ENUM ('open','closed','waitlist','not_yet_open','unknown');
CREATE TYPE availability_status AS ENUM ('spots_available','limited','full','waitlist','unknown');
CREATE TYPE geo_precision AS ENUM ('rooftop','street','postal','city','unknown');
CREATE TYPE indoor_outdoor AS ENUM ('indoor','outdoor','both','unknown');
CREATE TYPE gender_category AS ENUM ('girls','boys','coed','womens','mens','other','unknown');
CREATE TYPE level_category AS ENUM ('youth','high_school','collegiate','adult','unknown');
CREATE TYPE age_rule_type AS ENUM ('age_range','age_under','birth_year','grade','unknown');
CREATE TYPE play_format AS ENUM ('5v5','6v6','7v7','other','unknown');
CREATE TYPE competition_level AS ENUM ('recreational','competitive','elite','unknown');
CREATE TYPE pricing_basis AS ENUM ('per_team','per_player','per_family','unknown');
CREATE TYPE known_status AS ENUM ('known','unknown');
CREATE TYPE priority_bucket AS ENUM ('dfw','us','intl');
CREATE TYPE source_status AS ENUM ('enabled','pending_credentials','pending_permission','blocked','unsupported');
CREATE TYPE access_method AS ENUM ('official_api','partner_feed','json_ld','ical','rss','sitemap','static_html','browser_render','manual');
CREATE TYPE region_kind AS ENUM ('metro','city','state','country');

-- ---------- geography ----------
CREATE TABLE regions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  kind         region_kind NOT NULL,
  parent_id    uuid REFERENCES regions(id),
  country_code char(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  admin_area   text,
  timezone     text NOT NULL,
  center       geography(Point,4326) NOT NULL,
  radius_km    numeric(7,2) NOT NULL CHECK (radius_km > 0),
  priority_bucket priority_bucket NOT NULL,
  is_priority  boolean NOT NULL DEFAULT false,
  sort_order   int NOT NULL DEFAULT 0
);

-- ---------- organizers / series ----------
CREATE TABLE organizers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  website_url  text,
  published_contact_email text,
  published_contact_phone text,
  is_synthetic boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organizers_name_trgm ON organizers USING gin (name gin_trgm_ops);

CREATE TABLE event_series (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  organizer_id uuid REFERENCES organizers(id),
  is_synthetic boolean NOT NULL DEFAULT false
);

CREATE TABLE event_editions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id    uuid NOT NULL REFERENCES event_series(id),
  label        text NOT NULL,           -- e.g. "2026", "Spring 2026", "Weekend 2"
  season_year  int,
  is_synthetic boolean NOT NULL DEFAULT false,
  UNIQUE (series_id, label)
);

-- ---------- events ----------
CREATE TABLE events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL,
  organizer_id  uuid REFERENCES organizers(id),
  series_id     uuid REFERENCES event_series(id),
  edition_id    uuid REFERENCES event_editions(id),
  event_type    event_type NOT NULL DEFAULT 'other',
  sport_scope   sport_scope NOT NULL DEFAULT 'unknown',
  season        text,
  -- All-day/local semantics: local date + IANA tz. Never UTC midnight.
  start_date    date,
  end_date      date,
  start_at      timestamptz,
  end_at        timestamptz,
  timezone      text NOT NULL,
  date_precision date_precision NOT NULL DEFAULT 'tbd',
  time_known    boolean NOT NULL DEFAULT false,
  status        event_status NOT NULL DEFAULT 'scheduled',
  status_evidence text,
  registration_url text,
  registration_deadline date,
  registration_deadline_status known_status NOT NULL DEFAULT 'unknown',
  registration_status registration_status NOT NULL DEFAULT 'unknown',
  availability  availability_status NOT NULL DEFAULT 'unknown',
  availability_note text,
  description   text,
  verification_level verification_level NOT NULL DEFAULT 'discovered_unverified',
  publish_state publish_state NOT NULL DEFAULT 'draft',
  merged_into_id uuid REFERENCES events(id),
  is_synthetic  boolean NOT NULL DEFAULT false,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  source_updated_at timestamptz,
  last_material_change_at timestamptz,
  content_hash  text,
  during        daterange GENERATED ALWAYS AS (
                  CASE WHEN start_date IS NULL THEN NULL
                       ELSE daterange(start_date, COALESCE(end_date, start_date), '[]') END) STORED,
  search_tsv    tsvector GENERATED ALWAYS AS (
                  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(season,'') || ' ' || coalesce(description,''))) STORED,
  CONSTRAINT events_dates_ordered CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT events_publish_flag_only CHECK (publish_state <> 'published' OR sport_scope IN ('flag','mixed')),
  CONSTRAINT events_merged_has_target CHECK ((publish_state = 'merged') = (merged_into_id IS NOT NULL)),
  CONSTRAINT events_status_evidence CHECK (status NOT IN ('cancelled','postponed') OR status_evidence IS NOT NULL),
  CONSTRAINT events_deadline_known CHECK ((registration_deadline IS NULL) = (registration_deadline_status = 'unknown')),
  CONSTRAINT events_tz CHECK (timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+\-]+)+$|^UTC$')
);
CREATE INDEX events_during_gist ON events USING gist (during);
CREATE INDEX events_publish_idx ON events (publish_state, is_synthetic, start_date);
CREATE INDEX events_name_trgm ON events USING gin (name gin_trgm_ops);
CREATE INDEX events_tsv ON events USING gin (search_tsv);
CREATE INDEX events_deadline_idx ON events (registration_deadline) WHERE registration_deadline IS NOT NULL;

CREATE TABLE league_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        text NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  game_days   text[] NOT NULL DEFAULT '{}',
  practice_schedule text,
  during      daterange GENERATED ALWAYS AS (daterange(start_date, end_date, '[]')) STORED,
  CHECK (end_date >= start_date)
);
CREATE INDEX league_sessions_during_gist ON league_sessions USING gist (during);
CREATE INDEX league_sessions_event ON league_sessions (event_id);

CREATE TABLE venues (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  address_line1 text,
  address_line2 text,
  locality      text,
  admin_area    text,
  postal_code   text,           -- free-form, international
  country_code  char(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  location      geography(Point,4326),
  geo_precision geo_precision NOT NULL DEFAULT 'unknown',
  geocode_provider text,        -- 'source_published' | 'google' | 'apple' | 'synthetic' | ...
  geocode_license  text,        -- license class governing where coordinates may be rendered
  indoor_outdoor indoor_outdoor NOT NULL DEFAULT 'unknown',
  is_synthetic  boolean NOT NULL DEFAULT false,
  CONSTRAINT venues_location_provenance CHECK (location IS NULL OR (geocode_provider IS NOT NULL AND geocode_license IS NOT NULL)),
  CONSTRAINT venues_location_precision CHECK (location IS NULL OR geo_precision <> 'unknown')
);
CREATE INDEX venues_location_gist ON venues USING gist (location);

CREATE TABLE event_venues (
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_id   uuid NOT NULL REFERENCES venues(id),
  is_primary boolean NOT NULL DEFAULT false,
  note       text,
  PRIMARY KEY (event_id, venue_id)
);
CREATE INDEX event_venues_venue ON event_venues (venue_id);

CREATE TABLE divisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name             text NOT NULL,
  sport_scope      sport_scope NOT NULL DEFAULT 'flag',
  gender_category  gender_category NOT NULL DEFAULT 'unknown',
  gender_label_original text,
  level_category   level_category NOT NULL DEFAULT 'unknown',
  age_rule_type    age_rule_type NOT NULL DEFAULT 'unknown',
  age_min          int CHECK (age_min IS NULL OR age_min BETWEEN 3 AND 99),
  age_max          int CHECK (age_max IS NULL OR age_max BETWEEN 3 AND 99),
  birth_year_min   int,
  birth_year_max   int,
  grade_min        int,
  grade_max        int,
  age_cutoff_date  date,
  eligibility_original text,
  format           play_format NOT NULL DEFAULT 'unknown',
  contact_classification text,
  rulebook_url     text,
  competition_level competition_level NOT NULL DEFAULT 'unknown',
  game_guarantee   int CHECK (game_guarantee IS NULL OR game_guarantee >= 0),
  fee_status       known_status NOT NULL DEFAULT 'unknown',
  fee_amount_minor bigint CHECK (fee_amount_minor IS NULL OR fee_amount_minor >= 0),
  fee_currency     char(3) CHECK (fee_currency IS NULL OR fee_currency ~ '^[A-Z]{3}$'),
  pricing_basis    pricing_basis NOT NULL DEFAULT 'unknown',
  capacity_status  known_status NOT NULL DEFAULT 'unknown',
  capacity_teams   int,
  -- A missing price is never "free": amount present iff status known, and currency required with amount.
  CONSTRAINT divisions_fee_known CHECK ((fee_status = 'known') = (fee_amount_minor IS NOT NULL)),
  CONSTRAINT divisions_fee_currency CHECK (fee_amount_minor IS NULL OR fee_currency IS NOT NULL),
  CONSTRAINT divisions_capacity_known CHECK ((capacity_status = 'known') = (capacity_teams IS NOT NULL)),
  CONSTRAINT divisions_age_order CHECK (age_min IS NULL OR age_max IS NULL OR age_max >= age_min)
);
CREATE INDEX divisions_event ON divisions (event_id);
CREATE INDEX divisions_filter ON divisions (gender_category, level_category, age_min, age_max);

CREATE TABLE division_extra_fees (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id   uuid NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  label         text NOT NULL,
  amount_minor  bigint NOT NULL CHECK (amount_minor >= 0),
  currency      char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  pricing_basis pricing_basis NOT NULL DEFAULT 'unknown',
  mandatory     boolean NOT NULL DEFAULT true
);

-- ---------- sources & ingestion ----------
CREATE TABLE sources (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key              text NOT NULL UNIQUE,
  name             text NOT NULL,
  url              text NOT NULL,
  connector_key    text NOT NULL,
  parser_version   text NOT NULL,
  coverage_regions text[] NOT NULL DEFAULT '{}',
  event_types      text[] NOT NULL DEFAULT '{}',
  access_method    access_method NOT NULL,
  permission_notes text NOT NULL,
  robots_checked_at date,
  tos_url          text,
  status           source_status NOT NULL,
  status_reason    text NOT NULL,
  config           jsonb NOT NULL DEFAULT '{}',
  paused           boolean NOT NULL DEFAULT false,
  priority_bucket  priority_bucket NOT NULL DEFAULT 'dfw',
  refresh_cadence_minutes int NOT NULL DEFAULT 60 CHECK (refresh_cadence_minutes >= 15),
  rate_limit_per_minute   int NOT NULL DEFAULT 6 CHECK (rate_limit_per_minute > 0),
  supports_conditional    boolean NOT NULL DEFAULT false,
  last_attempt_at  timestamptz,
  last_success_at  timestamptz,
  next_scheduled_at timestamptz,
  consecutive_failures int NOT NULL DEFAULT 0,
  last_errors      jsonb NOT NULL DEFAULT '[]',
  circuit_open_until timestamptz,
  discovered_count int NOT NULL DEFAULT 0,
  published_count  int NOT NULL DEFAULT 0,
  rejected_count   int NOT NULL DEFAULT 0,
  is_synthetic     boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE raw_payloads (
  sha256       text PRIMARY KEY,
  content_type text,
  body         text NOT NULL,
  byte_size    int NOT NULL,
  captured_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      uuid NOT NULL REFERENCES sources(id),
  external_key   text NOT NULL,            -- external id, or sha256(url) when no id
  external_id    text,
  url            text NOT NULL,
  event_id       uuid REFERENCES events(id),
  original_event_id uuid REFERENCES events(id),  -- pre-merge owner, for unmerge
  raw_sha256     text REFERENCES raw_payloads(sha256),
  parser_version text NOT NULL,
  content_hash   text NOT NULL,
  normalized     jsonb NOT NULL,
  field_map      jsonb NOT NULL DEFAULT '{}',
  record_status  text NOT NULL DEFAULT 'active' CHECK (record_status IN ('active','missing','rejected')),
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  missing_since  timestamptz,
  is_synthetic   boolean NOT NULL DEFAULT false,
  UNIQUE (source_id, external_key)
);
CREATE INDEX source_records_event ON source_records (event_id);

CREATE TABLE field_provenance (
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field           text NOT NULL,
  source_record_id uuid NOT NULL REFERENCES source_records(id),
  value           jsonb,
  observed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, field, source_record_id)
);

CREATE TABLE conflicts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field      text NOT NULL,
  candidates jsonb NOT NULL,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX conflicts_open_unique ON conflicts (event_id, field) WHERE status = 'open';

CREATE TABLE event_changes (
  id            bigserial PRIMARY KEY,
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field         text NOT NULL,
  old_value     jsonb,
  new_value     jsonb,
  material      boolean NOT NULL,
  source_record_id uuid REFERENCES source_records(id),
  actor         text NOT NULL DEFAULT 'ingestion',
  detected_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_changes_event ON event_changes (event_id, detected_at DESC);

CREATE TABLE ingestion_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      uuid REFERENCES sources(id),
  job_type       text NOT NULL,
  correlation_id text NOT NULL,
  window_key     text,
  status         text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','skipped')),
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  stats          jsonb NOT NULL DEFAULT '{}',
  error          text
);
CREATE INDEX ingestion_runs_source ON ingestion_runs (source_id, started_at DESC);

-- ---------- dedup / merges ----------
CREATE TABLE dedup_candidates (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_a   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_b   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  score     numeric(4,3) NOT NULL,
  features  jsonb NOT NULL,
  status    text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','merged','distinct')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (event_a < event_b),
  UNIQUE (event_a, event_b)
);

CREATE TABLE merges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survivor_id uuid NOT NULL REFERENCES events(id),
  merged_id   uuid NOT NULL REFERENCES events(id),
  score       numeric(4,3),
  method      text NOT NULL CHECK (method IN ('auto','admin')),
  actor       text NOT NULL,
  moved_source_record_ids uuid[] NOT NULL,
  prior_publish_state publish_state NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  undone_at   timestamptz
);

-- ---------- review / submissions ----------
CREATE TABLE review_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('ambiguous_extraction','source_missing','stale','failed_source','submission','conflict','dedup','correction','claim','status_change')),
  event_id    uuid REFERENCES events(id) ON DELETE CASCADE,
  source_id   uuid REFERENCES sources(id),
  ref_id      uuid,
  reason      text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);
CREATE UNIQUE INDEX review_items_open_unique ON review_items (kind, coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(ref_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE status = 'open';

CREATE TABLE uploads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key  text NOT NULL UNIQUE,
  mime         text NOT NULL,
  byte_size    int NOT NULL,
  sha256       text NOT NULL,
  original_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------- settings / budgets / audit ----------
CREATE TABLE app_settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crawl_budget (
  bucket priority_bucket PRIMARY KEY,
  weight numeric(4,3) NOT NULL CHECK (weight >= 0 AND weight <= 1)
);

CREATE TABLE provider_usage (
  provider   text NOT NULL,
  month      text NOT NULL,          -- YYYY-MM
  units      bigint NOT NULL DEFAULT 0,
  cost_micro_usd bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, month)
);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  actor      text NOT NULL,
  action     text NOT NULL,
  target_type text,
  target_id  text,
  details    jsonb NOT NULL DEFAULT '{}',
  at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_outbox (
  id         bigserial PRIMARY KEY,
  to_address text NOT NULL,
  subject    text NOT NULL,
  body_text  text NOT NULL,
  transport  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- append-only guards ----------
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER event_changes_append_only BEFORE UPDATE ON event_changes FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------- Invariant 6: published real events must have a supporting source record + URL ----------
CREATE FUNCTION assert_published_has_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ev record;
BEGIN
  IF TG_TABLE_NAME = 'events' THEN
    SELECT id, publish_state, is_synthetic INTO ev FROM events WHERE id = NEW.id;
  ELSE
    SELECT id, publish_state, is_synthetic INTO ev FROM events WHERE id = OLD.event_id;
  END IF;
  IF ev.id IS NOT NULL AND ev.publish_state = 'published' AND NOT ev.is_synthetic THEN
    IF NOT EXISTS (SELECT 1 FROM source_records sr WHERE sr.event_id = ev.id AND sr.url ~ '^https?://' AND sr.record_status <> 'rejected') THEN
      RAISE EXCEPTION 'Invariant 6 violated: published event % has no supporting source record with URL', ev.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER events_published_requires_source
  AFTER INSERT OR UPDATE ON events DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_published_has_source();
CREATE CONSTRAINT TRIGGER source_records_keep_published_source
  AFTER UPDATE OR DELETE ON source_records DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_published_has_source();

-- Synthetic data may never attach to a real source and vice versa.
CREATE FUNCTION assert_synthetic_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.event_id IS NOT NULL AND EXISTS (SELECT 1 FROM events e WHERE e.id = NEW.event_id AND e.is_synthetic <> NEW.is_synthetic) THEN
    RAISE EXCEPTION 'synthetic/real mismatch between source_record % and event %', NEW.id, NEW.event_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER source_records_synthetic_consistency BEFORE INSERT OR UPDATE ON source_records FOR EACH ROW EXECUTE FUNCTION assert_synthetic_consistency();

-- ---------- defaults ----------
INSERT INTO crawl_budget (bucket, weight) VALUES ('dfw', 0.60), ('us', 0.25), ('intl', 0.15);
INSERT INTO app_settings (key, value) VALUES
  ('dedup_thresholds', '{"auto_merge": 0.90, "review": 0.60}'),
  ('extraction_confidence_threshold', '0.80'),
  ('stale_after_hours', '72'),
  ('sitemap_expired_grace_days', '30');
