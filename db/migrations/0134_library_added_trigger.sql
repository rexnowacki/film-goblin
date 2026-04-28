-- 0134_library_added_trigger.sql
-- Fan-out trigger: library insert → activity (kind='library_added'),
-- gated by profiles.broadcast_library. Mirrors activity_on_watchlist_insert
-- (0112) and activity_on_watch_insert (0124). Depends on 0133 (the
-- 'library_added' enum value committed in its own transaction).

CREATE OR REPLACE FUNCTION public.activity_on_library_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  broadcast BOOLEAN;
BEGIN
  SELECT broadcast_library INTO broadcast FROM public.profiles WHERE id = NEW.user_id;
  IF broadcast IS TRUE THEN
    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (NEW.user_id, 'library_added', jsonb_build_object('film_id', NEW.film_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_library_insert
AFTER INSERT ON library
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_library_insert();
