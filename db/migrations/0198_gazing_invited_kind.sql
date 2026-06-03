-- 0198_gazing_invited_kind.sql
-- Add the 'gazing_invited' activity kind. Separate file from the trigger (0199)
-- because ALTER TYPE … ADD VALUE must commit before a function can reference
-- the new value. Mirrors 0194/0195 (user_joined).

ALTER TYPE activity_kind ADD VALUE IF NOT EXISTS 'gazing_invited';
