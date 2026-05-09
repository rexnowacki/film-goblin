-- Manual series override for cases the title heuristic can't catch
-- (e.g. "Friday the 13th: A New Beginning" — no numeral suffix).
--
-- A film_series row is just a name + id. Films are linked via
-- films.series_id with a position via films.series_order. NULL on either
-- column means the film falls back to the title-heuristic in
-- app/lib/series-order.ts.

CREATE TABLE film_series (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE film_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "film_series public read" ON film_series
  FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE policy — admin writes via service role only.

ALTER TABLE films
  ADD COLUMN series_id    UUID REFERENCES film_series(id) ON DELETE SET NULL,
  ADD COLUMN series_order INTEGER;

CREATE INDEX films_series_idx ON films (series_id) WHERE series_id IS NOT NULL;
