-- 0129_activity_comments.sql
-- Flat 140-char comments on activity rows. Surrogate id (vs activity_reactions'
-- composite PK) because multiple comments per (activity, user) are valid.
-- DELETE policy is two-disjunct: comment author OR the activity's actor — the
-- actor gets a moderation hatch on their own row.

CREATE TABLE activity_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id   UUID NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 140),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activity_comments_activity_created_idx
  ON activity_comments (activity_id, created_at);
CREATE INDEX activity_comments_user_id_idx
  ON activity_comments (user_id);

ALTER TABLE activity_comments ENABLE ROW LEVEL SECURITY;

-- Anyone authed reads — feed and profile surfaces both render threads.
CREATE POLICY activity_comments_select
  ON activity_comments FOR SELECT
  TO authenticated
  USING (true);

-- Author identity enforced on insert.
CREATE POLICY activity_comments_insert
  ON activity_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Author OR activity owner can delete.
CREATE POLICY activity_comments_delete
  ON activity_comments FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = (SELECT actor_user_id FROM activity WHERE id = activity_comments.activity_id)
  );

-- No UPDATE policy — edits not supported in v1.

GRANT SELECT, INSERT, DELETE ON activity_comments TO authenticated;
