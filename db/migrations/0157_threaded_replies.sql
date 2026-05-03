-- 0157_threaded_replies.sql
-- Adds self-referential threading to activity_comments.
-- parent_id NULL = top-level comment; non-null = reply.
-- reply_count is maintained by the ac_bump_reply_count trigger.
-- ON DELETE CASCADE means deleting a parent removes its replies;
-- the trigger fires for each cascaded delete but the UPDATE on a
-- deleted parent is a no-op — safe.

ALTER TABLE activity_comments
  ADD COLUMN parent_id   UUID REFERENCES activity_comments(id) ON DELETE CASCADE,
  ADD COLUMN reply_count INT NOT NULL DEFAULT 0;

CREATE INDEX activity_comments_parent_idx
  ON activity_comments (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION ac_bump_reply_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE activity_comments SET reply_count = reply_count + 1
     WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE activity_comments SET reply_count = GREATEST(reply_count - 1, 0)
     WHERE id = OLD.parent_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER ac_bump_reply_count_trg
  AFTER INSERT OR DELETE ON activity_comments
  FOR EACH ROW EXECUTE FUNCTION ac_bump_reply_count();
