-- 0178: extend films_with_stats with trailer columns from mig 0150.
--
-- Trailer fields live on the films table since 0150 (curated by the
-- fg-trailers Rust TUI). The /film/[id] read path goes through the
-- films_with_stats view, so the view needs them too. Following the
-- established additive pattern: DROP + CREATE, new columns appended.

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
  ) AS coven_rating_pct,
  f.trailer_url,
  f.trailer_youtube_id,
  f.trailer_label,
  f.trailer_verified
FROM films f;

GRANT SELECT ON films_with_stats TO anon, authenticated;
