-- Drops the stubbed watchlists + price_alerts created by worker migration 0003.
-- Real versions with proper FKs to auth.users are recreated in 0105_watchlists.sql.

DROP TABLE IF EXISTS price_alerts;
DROP TABLE IF EXISTS watchlists;
