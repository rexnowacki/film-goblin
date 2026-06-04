-- 0200_gazing_rsvp_kinds.sql
-- Enum values for "accept a summoning" (RSVP). Separate file from the table +
-- triggers (0201) because ALTER TYPE ... ADD VALUE must commit before a function
-- can reference the new value. Mirrors 0198/0199 (gazing_invited).

ALTER TYPE activity_kind ADD VALUE IF NOT EXISTS 'gazing_attending';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'gazing_rsvp';
