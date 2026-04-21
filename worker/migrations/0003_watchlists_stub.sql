-- NOTE: The full watchlists + users schema is owned by sub-project 2.
-- This stub defines the minimum surface this worker needs.

CREATE TABLE IF NOT EXISTS watchlists (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  film_id           UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  max_price_usd     NUMERIC(6,2),
  last_alerted_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, film_id)
);

CREATE INDEX watchlists_film_id_idx ON watchlists (film_id);

CREATE TABLE IF NOT EXISTS price_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id    UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  film_id         UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  old_price_usd   NUMERIC(6,2) NOT NULL,
  new_price_usd   NUMERIC(6,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
