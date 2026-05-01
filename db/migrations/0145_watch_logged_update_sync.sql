-- 0145: propagate `watched.note` and `watched.recommended` edits into the
-- matching `watch_logged` activity payload.
--
-- Per 0132 + 0142, the INSERT trigger snapshots note + recommended into
-- the activity payload at watch time. Edits made afterward (via the
-- WatchModal in edit mode) updated `watched` but left the activity row
-- stale, so feed rows kept showing the original note/verdict.
--
-- The match is a join on (actor_user_id, payload->>'film_id', created_at)
-- within a ±5s window — same shape as the 0143 backfill. There can be
-- multiple watch_logged rows for the same (user, film), one per
-- re-watch; the timestamp window pairs each watched row with the
-- activity row born from its own INSERT trigger run.
--
-- Only fires when broadcast was on at INSERT time (i.e. an activity row
-- exists). If the user toggled broadcast_watched off and back on
-- between INSERT and UPDATE, the activity row was never created and
-- this is a no-op — same outcome as today.

CREATE OR REPLACE FUNCTION public.activity_on_watch_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.note IS DISTINCT FROM OLD.note
     OR NEW.recommended IS DISTINCT FROM OLD.recommended THEN
    UPDATE public.activity
       SET payload = payload
                     || jsonb_build_object('note', NEW.note)
                     || jsonb_build_object('recommended', NEW.recommended)
     WHERE actor_user_id = NEW.user_id
       AND kind = 'watch_logged'
       AND payload->>'film_id' = NEW.film_id::text
       AND created_at BETWEEN NEW.created_at - INTERVAL '5 seconds'
                          AND NEW.created_at + INTERVAL '5 seconds';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS watched_after_update ON public.watched;
CREATE TRIGGER watched_after_update
  AFTER UPDATE ON public.watched
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_on_watch_update();
