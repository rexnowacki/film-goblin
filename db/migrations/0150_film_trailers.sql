-- 0150_film_trailers.sql
--
-- Adds trailer metadata columns to `films` for the fg-trailers TUI curation tool.
-- Source of truth lives here; fg-trailers/sql/add_trailer_fields.sql mirrors this
-- for portability if the tool is ever pulled out of the monorepo.

ALTER TABLE films
  ADD COLUMN IF NOT EXISTS trailer_url         TEXT,
  ADD COLUMN IF NOT EXISTS trailer_source      TEXT DEFAULT 'youtube',
  ADD COLUMN IF NOT EXISTS trailer_youtube_id  TEXT,
  ADD COLUMN IF NOT EXISTS trailer_label       TEXT DEFAULT 'Official Trailer',
  ADD COLUMN IF NOT EXISTS trailer_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trailer_updated_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS films_trailer_missing_idx
  ON films ((trailer_url IS NULL));
