-- Dedupe price alerts: at most one un-notified ("open") alert per watchlist+film.
--
-- Bug: two overlapping `refresh-prices` runs each detected the same drop and
-- fired an alert, so a user saw the same film twice in one digest (e.g. "Smile"
-- on 2026-06-02). Both alerts had notified_at IS NULL at insert time. The worker
-- now treats the duplicate insert as a no-op (catches 23505); this index is the
-- DB guarantee that backs it. See worker/src/db.ts createAlertAndMark.

-- Collapse any pre-existing open duplicates so the unique index can build.
-- Keep the earliest row per (watchlist_id, film_id) among un-notified alerts.
DELETE FROM price_alerts a
USING price_alerts b
WHERE a.notified_at IS NULL
  AND b.notified_at IS NULL
  AND a.watchlist_id = b.watchlist_id
  AND a.film_id = b.film_id
  AND (a.created_at, a.id) > (b.created_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS price_alerts_open_uniq
  ON price_alerts (watchlist_id, film_id) WHERE notified_at IS NULL;
