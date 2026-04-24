-- Backfill max_price_usd on watchlists rows where it's null, using the
-- current latest_price from price_history. This lights up the price-drop
-- indicator on /watchlist for rows added before the auto-capture behavior
-- shipped in feat/watchlist (commit 6266cd2, 2026-04-24).
--
-- After auto-capture, new watchlist inserts carry the add-time price in
-- max_price_usd; these older rows need a one-shot fill. Rows whose films
-- have no price_history yet stay null (correct — there's no threshold to
-- pick yet). Idempotent: re-running is a no-op once the nulls are filled.

UPDATE watchlists w
SET max_price_usd = sub.price_usd
FROM (
  SELECT DISTINCT ON (film_id) film_id, price_usd
  FROM price_history
  ORDER BY film_id, captured_at DESC
) sub
WHERE w.film_id = sub.film_id
  AND w.max_price_usd IS NULL
  AND sub.price_usd IS NOT NULL;
