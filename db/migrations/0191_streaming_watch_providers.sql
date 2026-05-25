-- 0191: TMDB watch-provider availability for streaming/rent/buy display.

ALTER TABLE films
  ADD COLUMN IF NOT EXISTS streaming_availability_checked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS film_watch_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  region TEXT NOT NULL DEFAULT 'US',
  provider_id INTEGER NOT NULL,
  provider_name TEXT NOT NULL,
  provider_logo_path TEXT,
  category TEXT NOT NULL CHECK (category IN ('flatrate', 'free', 'ads', 'rent', 'buy')),
  display_priority INTEGER NOT NULL DEFAULT 999,
  tmdb_link TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (film_id, region, provider_id, category)
);

CREATE INDEX IF NOT EXISTS film_watch_providers_film_region_idx
  ON film_watch_providers (film_id, region, category, display_priority);

ALTER TABLE film_watch_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS film_watch_providers_read ON film_watch_providers;
CREATE POLICY film_watch_providers_read ON film_watch_providers
  FOR SELECT
  USING (true);

GRANT SELECT ON film_watch_providers TO anon, authenticated;
