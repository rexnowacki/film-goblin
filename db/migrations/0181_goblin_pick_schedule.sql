-- 0181: convert goblin_pick from single-row to a scheduled queue.
-- The active pick is the row whose effective_at <= now() with the greatest effective_at.
-- Future-dated rows are queued and become active automatically when their time arrives.
-- No cron needed — selection is purely time-based at query time.

-- Drop the single-row CHECK so multiple picks can coexist.
ALTER TABLE goblin_pick DROP CONSTRAINT IF EXISTS goblin_pick_single_row;

-- Replace the hard-coded id=1 default with a sequence for new rows.
CREATE SEQUENCE IF NOT EXISTS goblin_pick_id_seq AS INT;
ALTER SEQUENCE goblin_pick_id_seq OWNED BY goblin_pick.id;
ALTER TABLE goblin_pick ALTER COLUMN id SET DEFAULT nextval('goblin_pick_id_seq');
SELECT setval('goblin_pick_id_seq', GREATEST((SELECT COALESCE(MAX(id), 0) FROM goblin_pick), 1));

-- effective_at: when this pick becomes the active one.
-- Existing single row keeps its set_at as effective_at so it stays current.
ALTER TABLE goblin_pick ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ;
UPDATE goblin_pick SET effective_at = set_at WHERE effective_at IS NULL;
ALTER TABLE goblin_pick ALTER COLUMN effective_at SET NOT NULL;
ALTER TABLE goblin_pick ALTER COLUMN effective_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS goblin_pick_effective_at_idx ON goblin_pick (effective_at DESC);
