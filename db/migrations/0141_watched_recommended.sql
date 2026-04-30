-- 0141: per-watch recommend/don't-recommend rating + films_with_stats
-- aggregate.
--
-- Sub-project 24. RT-style binary recommendation:
--   recommended = TRUE  -- "loved it"
--   recommended = FALSE -- "didn't love it"
--   recommended = NULL  -- skipped (no rating)
--
-- The aggregate (films_with_stats.coven_rating_pct) is a percentage 0-100,
-- computed from the LATEST non-null rating per (user, film) — so a user who
-- watched twice with conflicting ratings counts once, with their most recent
-- vote. Pct is NULL until at least 5 distinct users have rated, matching
-- the 5-rating threshold flagged by the user. coven_rating_count exposes
-- the running tally so the UI can render an "awaiting verdict (3 of 5)"
-- placeholder.
--
-- View extension follows the established additive-only pattern: DROP +
-- recreate, new columns appended at the end. All consumers select explicit
-- column lists, so additive changes can't break them.

ALTER TABLE watched ADD COLUMN recommended BOOLEAN NULL;

DROP VIEW IF EXISTS films_with_stats;
CREATE VIEW films_with_stats AS
WITH latest_rating AS (
  SELECT DISTINCT ON (user_id, film_id)
    user_id, film_id, recommended
  FROM watched
  WHERE recommended IS NOT NULL
  ORDER BY user_id, film_id, watched_at DESC, created_at DESC
)
SELECT
  f.id, f.itunes_id, f.title, f.director, f.year, f.runtime_min,
  f.genre_primary, f.description, f.content_advisory, f.artwork_url,
  f.itunes_url, f.tracking, f.available, f.first_seen_at,
  f.last_checked_at, f.last_priced_at,
  (SELECT count(*)::int FROM watchlists w WHERE w.film_id = f.id) AS watchlist_count,
  (SELECT count(*)::int FROM library l WHERE l.film_id = f.id) AS owned_count,
  (SELECT count(DISTINCT user_id)::int FROM watched WHERE film_id = f.id) AS watcher_count,
  (SELECT price_usd FROM price_history ph WHERE ph.film_id = f.id ORDER BY captured_at DESC LIMIT 1) AS latest_price,
  (SELECT count(*)::int FROM latest_rating lr WHERE lr.film_id = f.id) AS coven_rating_count,
  (
    SELECT CASE
      WHEN count(*) >= 5
      THEN ROUND(100.0 * count(*) FILTER (WHERE recommended) / count(*))::int
      ELSE NULL
    END
    FROM latest_rating lr
    WHERE lr.film_id = f.id
  ) AS coven_rating_pct
FROM films f;

GRANT SELECT ON films_with_stats TO anon, authenticated;
