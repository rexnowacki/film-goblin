-- Default-on email notification preference for every user.
ALTER TABLE profiles
  ADD COLUMN email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Per-alert delivery marker. NULL = not yet delivered.
ALTER TABLE price_alerts
  ADD COLUMN notified_at TIMESTAMPTZ;

-- Speeds up the notifier's "find undelivered alerts" scan.
CREATE INDEX price_alerts_notified_at_null_idx
  ON price_alerts (created_at)
  WHERE notified_at IS NULL;
