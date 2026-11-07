-- Conditional request validators per fetched URL (ETag / Last-Modified).
CREATE TABLE fetch_state (
  source_id     uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url           text NOT NULL,
  etag          text,
  last_modified text,
  last_raw_sha256 text REFERENCES raw_payloads(sha256),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, url)
);
