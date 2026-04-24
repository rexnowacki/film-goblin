-- Stats view for the public films archive. Surfaces per-film aggregate
-- signals (watchlist_count, latest_price) so PostgREST can ORDER BY them.
--
-- Uses default view-owner (definer) semantics so the subqueries on
-- `watchlists` and `price_history` run as the view owner (postgres,
-- BYPASSRLS) — that lets anon/authenticated read aggregate counts
-- without exposing individual rows. Individual watchlist rows stay
-- RLS-gated on the underlying table.
CREATE OR REPLACE VIEW films_with_stats AS
SELECT
  f.id,
  f.itunes_id,
  f.title,
  f.director,
  f.year,
  f.runtime_min,
  f.genre_primary,
  f.description,
  f.content_advisory,
  f.artwork_url,
  f.itunes_url,
  f.tracking,
  f.available,
  f.first_seen_at,
  f.last_checked_at,
  f.last_priced_at,
  (SELECT count(*)::int FROM watchlists w WHERE w.film_id = f.id) AS watchlist_count,
  (SELECT price_usd FROM price_history ph WHERE ph.film_id = f.id ORDER BY captured_at DESC LIMIT 1) AS latest_price
FROM films f;

GRANT SELECT ON films_with_stats TO anon, authenticated;
