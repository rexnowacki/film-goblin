-- Universal "heart" reactions on activity feed rows. One row per (activity, user);
-- re-clicking the heart is a delete. Self-likes are blocked at the action layer
-- (see app/lib/actions/reactions.ts) — enforcing at the DB would require a trigger
-- lookup against activity.actor_user_id, which doesn't pay for itself since the
-- app layer already prevents it and there's no adversarial risk given RLS scopes
-- writes to auth.uid().

CREATE TABLE activity_reactions (
  activity_id   UUID NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id)
);

-- Per-activity count + "did this user like this row" lookups both hit this index.
CREATE INDEX activity_reactions_activity_id_idx
  ON activity_reactions (activity_id);

-- "Which activities did this user like" scans (potential future use — e.g., a
-- 'my likes' tab) hit this one.
CREATE INDEX activity_reactions_user_id_idx
  ON activity_reactions (user_id);

ALTER TABLE activity_reactions ENABLE ROW LEVEL SECURITY;

-- Public read so the feed can show counts + "N coven members liked this" to any
-- authenticated reader. Does not leak user_id to non-authed clients because the
-- existing activity RLS already gates reads.
CREATE POLICY activity_reactions_select
  ON activity_reactions FOR SELECT
  TO authenticated
  USING (true);

-- Writes scoped to the acting user.
CREATE POLICY activity_reactions_insert
  ON activity_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY activity_reactions_delete
  ON activity_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- No UPDATE policy — reactions are boolean (exists or doesn't). Re-tapping the
-- heart is DELETE + INSERT, not UPDATE.

GRANT SELECT, INSERT, DELETE ON activity_reactions TO authenticated;
