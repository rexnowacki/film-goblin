CREATE TABLE price_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id       UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  price_usd     NUMERIC(6,2) NOT NULL,
  hd_price_usd  NUMERIC(6,2),
  is_sale       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX price_history_film_id_captured_at_idx
  ON price_history (film_id, captured_at DESC);
