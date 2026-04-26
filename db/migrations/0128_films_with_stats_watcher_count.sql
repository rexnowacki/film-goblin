-- B2: Extend films_with_stats with watcher_count for the social-signal badges
-- on /films Archive cards. Counts DISTINCT user_id from watched (one row per
-- watcher, not one per watch event — multiple rewatches of the same film by
-- the same user count as 1).
DROP VIEW IF EXISTS films_with_stats;
CREATE VIEW films_with_stats AS
SELECT
  f.id, f.itunes_id, f.title, f.director, f.year, f.runtime_min,
  f.genre_primary, f.description, f.content_advisory, f.artwork_url,
  f.itunes_url, f.tracking, f.available, f.first_seen_at,
  f.last_checked_at, f.last_priced_at,
  (SELECT count(*)::int FROM watchlists w WHERE w.film_id = f.id) AS watchlist_count,
  (SELECT count(*)::int FROM library l WHERE l.film_id = f.id) AS owned_count,
  (SELECT count(DISTINCT user_id)::int FROM watched WHERE film_id = f.id) AS watcher_count,
  (SELECT price_usd FROM price_history ph WHERE ph.film_id = f.id ORDER BY captured_at DESC LIMIT 1) AS latest_price
FROM films f;

GRANT SELECT ON films_with_stats TO anon, authenticated;
