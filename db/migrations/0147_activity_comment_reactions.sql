-- 0147: likes on activity comments.
--
-- Mirrors activity_reactions: a composite PK (user_id, comment_id) collapses
-- the SELECT-then-INSERT race on toggle. Maintained `like_count` lives on
-- activity_comments so reads don't pay for an aggregate per row.
--
-- Trigger fires on each cascaded delete when a parent comment is deleted; the
-- UPDATE on a deleted parent is a no-op so the trigger is safe under cascade.

ALTER TABLE activity_comments
  ADD COLUMN like_count INT NOT NULL DEFAULT 0;

CREATE TABLE activity_comment_reactions (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES activity_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comment_id)
);

ALTER TABLE activity_comment_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY acr_select ON activity_comment_reactions
  FOR SELECT USING (true);

CREATE POLICY acr_insert ON activity_comment_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY acr_delete ON activity_comment_reactions
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION acr_bump_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE activity_comments
       SET like_count = like_count + 1
     WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE activity_comments
       SET like_count = GREATEST(like_count - 1, 0)
     WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER acr_bump_count_trg
  AFTER INSERT OR DELETE ON activity_comment_reactions
  FOR EACH ROW EXECUTE FUNCTION acr_bump_count();

CREATE INDEX idx_acr_comment ON activity_comment_reactions (comment_id);
