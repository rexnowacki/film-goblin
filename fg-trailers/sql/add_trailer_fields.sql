-- Mirror of db/migrations/0150_film_trailers.sql
-- Kept inside fg-trailers/ for portability if the tool is extracted from the monorepo.

ALTER TABLE films
  ADD COLUMN IF NOT EXISTS trailer_url         TEXT,
  ADD COLUMN IF NOT EXISTS trailer_source      TEXT DEFAULT 'youtube',
  ADD COLUMN IF NOT EXISTS trailer_youtube_id  TEXT,
  ADD COLUMN IF NOT EXISTS trailer_label       TEXT DEFAULT 'Official Trailer',
  ADD COLUMN IF NOT EXISTS trailer_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trailer_updated_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS films_trailer_missing_idx
  ON films ((trailer_url IS NULL));
