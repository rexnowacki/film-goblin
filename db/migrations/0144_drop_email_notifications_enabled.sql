-- 0144: drop the legacy email_notifications_enabled column.
--
-- Sub-project 22 (mig 0139) split this single boolean into a per-kind
-- matrix (email_price_drops + 3 siblings) and backfilled the price-drop
-- column from this one. The column has been kept for soak; nothing in
-- the app or notifier reads it now (settings, _updateProfile, the
-- unsubscribe route, and the notifier query all moved to the per-kind
-- columns).

ALTER TABLE profiles DROP COLUMN IF EXISTS email_notifications_enabled;
