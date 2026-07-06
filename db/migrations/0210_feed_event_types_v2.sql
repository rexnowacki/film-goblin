-- Living Pit v2 (spec 2026-07-06): eight new system event types.
-- ALTER TYPE ... ADD VALUE is safe inside the migration transaction as long
-- as the new values are not used in the same transaction (Postgres 12+).

ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'left_free';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'now_free';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'now_on_apple';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'last_showing';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'verdict_anointed';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'now_at_theater';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'full_moon';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'monthly_communion';
