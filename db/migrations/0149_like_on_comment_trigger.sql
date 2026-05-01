-- 0149: trigger on activity_comment_reactions AFTER INSERT — fans into a
-- notification for the comment's author. Self-likes are filtered by the
-- WHERE clause. Recipient's notify_comment_likes = FALSE also skips the
-- INSERT entirely.
--
-- Payload mirrors comment_on_activity (mig 0131) so the bell row reads
-- "<liker> liked your comment on <film>: 'snippet'" symmetric to
-- "<commenter> commented on <film>: 'snippet'".
--
-- Depends on 0148 (enum value committed in its own transaction).

CREATE OR REPLACE FUNCTION public.notify_like_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  SELECT
    c.user_id,
    'like_on_comment',
    NEW.user_id,
    jsonb_build_object(
      'activity_id', c.activity_id,
      'comment_id',  c.id,
      'body',        c.body,
      'film_id',     a.payload->>'film_id'
    )
  FROM activity_comments c
  JOIN activity a ON a.id = c.activity_id
  JOIN profiles p ON p.id = c.user_id
  WHERE c.id = NEW.comment_id
    AND c.user_id <> NEW.user_id
    AND p.notify_comment_likes = TRUE;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_comment_reaction_insert_notify
AFTER INSERT ON activity_comment_reactions
FOR EACH ROW EXECUTE FUNCTION public.notify_like_on_comment();
