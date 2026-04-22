CREATE TABLE follows (
  follower_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followed_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_user_id, followed_user_id),
  CHECK (follower_user_id <> followed_user_id)
);

CREATE INDEX follows_followed_user_id_idx ON follows (followed_user_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY follows_read ON follows
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY follows_insert ON follows
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_user_id);

-- Either party can delete: follower unfollows, followed soft-blocks
CREATE POLICY follows_delete ON follows
  FOR DELETE TO authenticated
  USING (auth.uid() IN (follower_user_id, followed_user_id));
