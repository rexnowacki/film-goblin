-- 0182: extend notification_kind enum with 'goblin_summon'.
-- Must be its own migration / transaction — Postgres can't ADD VALUE and
-- reference it within the same transaction (used by mig 0184's trigger).

ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'goblin_summon';
