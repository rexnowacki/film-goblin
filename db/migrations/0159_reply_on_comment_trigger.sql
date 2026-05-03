-- 0159_reply_on_comment_trigger.sql
-- Notifies the parent comment's author when a reply is inserted.
-- Skip conditions:
--   1. Not a reply (parent_id IS NULL)
--   2. Self-reply (replier = parent comment author)
--   3. Parent author = activity owner (they already get comment_on_activity)

CREATE OR REPLACE FUNCTION public.notify_reply_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parent_author_id  UUID;
  activity_owner_id UUID;
  film_id_val       TEXT;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;

  SELECT user_id INTO parent_author_id
    FROM activity_comments WHERE id = NEW.parent_id;

  -- NEW.activity_id references activity(id) directly
  SELECT a.actor_user_id, a.payload->>'film_id'
    INTO activity_owner_id, film_id_val
    FROM activity a
    WHERE a.id = NEW.activity_id
    LIMIT 1;

  IF NEW.user_id = parent_author_id   THEN RETURN NEW; END IF;
  IF parent_author_id = activity_owner_id THEN RETURN NEW; END IF;

  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  VALUES (
    parent_author_id,
    'reply_on_comment',
    NEW.user_id,
    jsonb_build_object(
      'activity_id',       NEW.activity_id,
      'parent_comment_id', NEW.parent_id,
      'comment_id',        NEW.id,
      'body',              NEW.body,
      'film_id',           film_id_val
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_activity_comment_reply_notify
  AFTER INSERT ON activity_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_reply_on_comment();
