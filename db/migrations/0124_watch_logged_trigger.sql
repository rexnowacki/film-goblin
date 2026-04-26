-- Fan-out trigger: watched insert → activity (kind='watch_logged'),
-- gated by profiles.broadcast_watched. Mirrors activity_on_watchlist_insert.
-- Separate file from 0123 because ALTER TYPE … ADD VALUE must commit before
-- a function can reference the new value.

CREATE OR REPLACE FUNCTION public.activity_on_watch_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  broadcast BOOLEAN;
BEGIN
  SELECT broadcast_watched INTO broadcast FROM public.profiles WHERE id = NEW.user_id;
  IF broadcast IS TRUE THEN
    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (NEW.user_id, 'watch_logged', jsonb_build_object('film_id', NEW.film_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_watch_insert
AFTER INSERT ON watched
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_watch_insert();
