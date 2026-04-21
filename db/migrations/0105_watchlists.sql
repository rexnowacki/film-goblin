-- Real watchlists + price_alerts, replacing the stub dropped in 0100.

CREATE TABLE watchlists (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  film_id           UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  max_price_usd     NUMERIC(6,2),
  last_alerted_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, film_id)
);

CREATE INDEX watchlists_film_id_idx ON watchlists (film_id);

CREATE TABLE price_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id    UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  film_id         UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  old_price_usd   NUMERIC(6,2) NOT NULL,
  new_price_usd   NUMERIC(6,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX price_alerts_watchlist_id_idx ON price_alerts (watchlist_id);

ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

-- Watchlists are private to the owner
CREATE POLICY watchlists_read ON watchlists
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY watchlists_insert ON watchlists
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY watchlists_update ON watchlists
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY watchlists_delete ON watchlists
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Alerts are readable only by the watchlist owner
CREATE POLICY price_alerts_read ON price_alerts
  FOR SELECT TO authenticated
  USING (auth.uid() = (SELECT user_id FROM watchlists WHERE id = watchlist_id));

-- No client write policies on price_alerts — only the worker (service-role) inserts
