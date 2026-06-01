-- Add the 'user_joined' activity kind. Separate file from the trigger (0195)
-- because ALTER TYPE … ADD VALUE must commit before a function can reference
-- the new value. Mirrors 0123/0124 (watch_logged).

ALTER TYPE activity_kind ADD VALUE IF NOT EXISTS 'user_joined';
