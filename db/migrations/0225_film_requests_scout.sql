-- db/migrations/0225_film_requests_scout.sql
-- Release Scout: weekly TMDB horror discovery queues picks into film_requests.
-- Spec: docs/superpowers/specs/2026-10-07-release-scout-design.md

ALTER TABLE film_requests DROP CONSTRAINT IF EXISTS film_requests_source_check;
ALTER TABLE film_requests ADD CONSTRAINT film_requests_source_check
  CHECK (source IN ('itunes', 'tmdb', 'manual', 'scout'));

ALTER TABLE film_requests DROP CONSTRAINT IF EXISTS film_requests_status_check;
ALTER TABLE film_requests ADD CONSTRAINT film_requests_status_check
  CHECK (status IN ('pending', 'fulfilled', 'dismissed'));

ALTER TABLE film_requests ADD COLUMN IF NOT EXISTS release_date DATE;
ALTER TABLE film_requests ADD COLUMN IF NOT EXISTS scout_window TEXT
  CHECK (scout_window IN ('digital', 'theatrical'));

CREATE UNIQUE INDEX IF NOT EXISTS film_requests_tmdb_id_uniq
  ON film_requests (tmdb_id) WHERE tmdb_id IS NOT NULL;
