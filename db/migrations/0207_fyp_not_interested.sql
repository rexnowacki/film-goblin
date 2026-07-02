-- 0207_fyp_not_interested.sql
-- Explicit "not interested" dismissals for the FYP. User-owned; DELETE = undo.

CREATE TABLE fyp_not_interested (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, film_id)
);

ALTER TABLE fyp_not_interested ENABLE ROW LEVEL SECURITY;

CREATE POLICY fyp_not_interested_select_own ON fyp_not_interested
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY fyp_not_interested_insert_own ON fyp_not_interested
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY fyp_not_interested_delete_own ON fyp_not_interested
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON fyp_not_interested TO authenticated;
