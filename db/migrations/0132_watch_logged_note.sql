-- 0132_watch_logged_note.sql
-- Include `note` in the watch_logged activity payload so the feed can render
-- the user's caption alongside the row. The note is snapshotted at INSERT
-- time; later edits to watched.note do NOT propagate (matches the
-- recommendation_sent pattern). Add an UPDATE-trigger sync if edit propagation
-- becomes important.

CREATE OR REPLACE FUNCTION public.activity_on_watch_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  broadcast BOOLEAN;
BEGIN
  SELECT broadcast_watched INTO broadcast FROM public.profiles WHERE id = NEW.user_id;
  IF broadcast IS TRUE THEN
    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (NEW.user_id, 'watch_logged', jsonb_build_object('film_id', NEW.film_id, 'note', NEW.note));
  END IF;
  RETURN NEW;
END;
$$;
