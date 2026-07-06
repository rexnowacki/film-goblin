-- The Living Pit: system feed events (spec 2026-07-05).
-- System-only rows — user activity stays in `activity`. Copy is rendered at
-- creation time so template edits never rewrite history.

CREATE TYPE feed_event_type AS ENUM (
  'price_drop','all_time_low','price_rise','new_film',
  'anniversary','goblin_pick','milestone'
);

CREATE TABLE feed_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type feed_event_type NOT NULL,
  film_id    UUID REFERENCES films(id) ON DELETE CASCADE,
  payload    JSONB NOT NULL DEFAULT '{}',
  copy       TEXT NOT NULL,
  priority   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX feed_events_created_idx ON feed_events (created_at DESC);
CREATE INDEX feed_events_dedup_idx ON feed_events (film_id, event_type, created_at);

ALTER TABLE feed_events ENABLE ROW LEVEL SECURITY;

-- The feed is the storefront: anon reads it too. Writes are service-role only
-- (cron jobs + admin server actions) — no client-role write policies exist.
GRANT SELECT, INSERT, UPDATE, DELETE ON feed_events TO anon, authenticated;

CREATE POLICY feed_events_read ON feed_events
  FOR SELECT TO anon, authenticated USING (true);
