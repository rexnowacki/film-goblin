-- 0166: Generic cron lock table for idempotent scheduled jobs.

CREATE TABLE IF NOT EXISTS cron_locks (
  key TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
