-- Commit enum values before 0219 or application code references them.
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'gazing_reminder_24h';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'gazing_reminder_2h';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'gazing_aftermath';
