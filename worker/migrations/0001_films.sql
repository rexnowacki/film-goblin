CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE films (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itunes_id         BIGINT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  director          TEXT NOT NULL DEFAULT '',
  year              INTEGER NOT NULL DEFAULT 0,
  runtime_min       INTEGER NOT NULL DEFAULT 0,
  genre_primary     TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  content_advisory  TEXT NOT NULL DEFAULT '',
  artwork_url       TEXT NOT NULL DEFAULT '',
  itunes_url        TEXT NOT NULL DEFAULT '',
  tracking          BOOLEAN NOT NULL DEFAULT TRUE,
  available         BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at   TIMESTAMPTZ,
  last_priced_at    TIMESTAMPTZ
);

CREATE INDEX films_last_checked_at_idx ON films (last_checked_at NULLS FIRST) WHERE tracking = TRUE;
