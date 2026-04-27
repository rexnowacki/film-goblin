-- 0131_comment_notification_trigger.sql
-- Fans inserts on activity_comments into a notification for the activity's
-- actor. Self-comments (user_id = actor_user_id) are filtered by the WHERE
-- clause so the INSERT inserts zero rows in that case.
--
-- Payload includes film_id when the underlying activity has one (review,
-- recommendation, watchlist_added, watch_logged, list_film_added). The bell
-- row hydrates film via that field, mirroring recommendation_received.
--
-- Depends on 0130 (notification_kind enum extension committed in its own
-- transaction).

CREATE OR REPLACE FUNCTION public.notify_comment_on_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  SELECT
    a.actor_user_id,
    'comment_on_activity',
    NEW.user_id,
    jsonb_build_object(
      'activity_id', NEW.activity_id,
      'comment_id',  NEW.id,
      'body',        NEW.body,
      'film_id',     a.payload->>'film_id'
    )
  FROM activity a
  WHERE a.id = NEW.activity_id
    AND a.actor_user_id <> NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_activity_comment_insert_notify
AFTER INSERT ON activity_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_comment_on_activity();
