-- Accounts, roles, community features. Auth tables follow Better Auth's core schema.
CREATE TYPE user_role AS ENUM ('user','organizer','moderator','admin');

CREATE TABLE "user" (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  email          text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image          text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),
  role           user_role NOT NULL DEFAULT 'user',
  distance_unit  text CHECK (distance_unit IN ('mi','km'))
);
CREATE TABLE "session" (
  id           text PRIMARY KEY,
  "expiresAt"  timestamptz NOT NULL,
  token        text NOT NULL UNIQUE,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now(),
  "ipAddress"  text,
  "userAgent"  text,
  "userId"     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE TABLE "account" (
  id            text PRIMARY KEY,
  "accountId"   text NOT NULL,
  "providerId"  text NOT NULL,
  "userId"      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken"     text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope         text,
  password      text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "verification" (
  id          text PRIMARY KEY,
  identifier  text NOT NULL,
  value       text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE favorites (
  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  alerts     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE TYPE alert_frequency AS ENUM ('instant','daily','weekly','off');
CREATE TABLE alert_preferences (
  user_id     text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  frequency   alert_frequency NOT NULL DEFAULT 'daily',
  confirmed_at timestamptz,             -- double opt-in
  confirm_token text UNIQUE,
  unsubscribe_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24),'hex'),
  unsubscribed_at timestamptz
);

CREATE TABLE saved_searches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name        text NOT NULL,
  query       text NOT NULL,          -- canonical serialized URL search state
  alerts      boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_deliveries (
  id          bigserial PRIMARY KEY,
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  dedupe_key  text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('event_change','new_match')),
  event_id    uuid REFERENCES events(id) ON DELETE CASCADE,
  payload     jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','suppressed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,
  UNIQUE (user_id, dedupe_key)
);

CREATE TABLE planner_plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE planner_items (
  plan_id     uuid NOT NULL REFERENCES planner_plans(id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  travel_days_before int NOT NULL DEFAULT 0 CHECK (travel_days_before BETWEEN 0 AND 7),
  travel_days_after  int NOT NULL DEFAULT 0 CHECK (travel_days_after BETWEEN 0 AND 7),
  PRIMARY KEY (plan_id, event_id)
);

CREATE TABLE organizer_claims (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id  uuid NOT NULL REFERENCES organizers(id),
  user_id       text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  evidence      text NOT NULL,
  verification_method text NOT NULL CHECK (verification_method IN ('email_domain','website_token','manual')),
  verification_token text NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  confirmed_event_ids uuid[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  decided_by    text
);

CREATE TABLE corrections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field       text NOT NULL,
  message     text NOT NULL,
  evidence_url text,
  reporter_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','applied','dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE submissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('url','flyer','post_url')),
  url          text,
  upload_id    uuid REFERENCES uploads(id),
  submitter_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
  submitter_note text,
  status       text NOT NULL DEFAULT 'received' CHECK (status IN ('received','fetching','awaiting_verification','in_review','published','rejected')),
  extraction   jsonb,
  extraction_method text,
  event_id     uuid REFERENCES events(id),
  rejection_reason text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'flyer') = (upload_id IS NOT NULL)),
  CHECK (kind = 'flyer' OR url IS NOT NULL)
);

CREATE TABLE rate_limits (
  bucket     text NOT NULL,
  window_start timestamptz NOT NULL,
  count      int NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
