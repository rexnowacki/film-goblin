-- 0175_itunes_availability_check.sql
--
-- Adds the columns and table needed by the weekly iTunes availability cron.
-- See docs/superpowers/specs/2026-05-08-itunes-availability-cron-design.md.

-- 1. Films: cron timing and TMDB origin tracking.
ALTER TABLE films
  ADD COLUMN IF NOT EXISTS tmdb_id INT,
  ADD COLUMN IF NOT EXISTS theatrical_release_date DATE,
  ADD COLUMN IF NOT EXISTS last_itunes_check_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS films_tmdb_id_idx ON films(tmdb_id)
  WHERE tmdb_id IS NOT NULL;

-- Cron read pattern: pull untracked theatrical-aged films cheaply.
CREATE INDEX IF NOT EXISTS films_itunes_check_pending_idx
  ON films(last_itunes_check_at NULLS FIRST, theatrical_release_date)
  WHERE itunes_id IS NULL AND tracking = FALSE;

-- 2. Restore the unique-itunes-id invariant. Original constraint was dropped
-- in mig 0118 when itunes_id became nullable. Partial unique index handles
-- the nullable case correctly.
CREATE UNIQUE INDEX IF NOT EXISTS films_itunes_id_unique
  ON films(itunes_id) WHERE itunes_id IS NOT NULL;

-- 3. Candidates table for fuzzy matches awaiting admin review.
CREATE TABLE IF NOT EXISTS itunes_candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id             UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  itunes_id           BIGINT NOT NULL,
  itunes_url          TEXT NOT NULL,
  match_title         TEXT NOT NULL,
  match_year          INT,
  match_artwork_url   TEXT,
  confidence          NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  match_type          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','rejected')),
  reviewed_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One pending candidate per film at a time.
CREATE UNIQUE INDEX IF NOT EXISTS itunes_candidates_one_pending_per_film
  ON itunes_candidates(film_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS itunes_candidates_status_idx
  ON itunes_candidates(status, created_at DESC);

-- 4. RLS — admin-only via service role. No policies = no client access.
ALTER TABLE itunes_candidates ENABLE ROW LEVEL SECURITY;
