-- 0168: Remove stale feed actions when a film leaves a user's watchlist.

CREATE OR REPLACE FUNCTION public.activity_on_watchlist_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.activity
  WHERE actor_user_id = OLD.user_id
    AND kind = 'watchlist_added'
    AND payload->>'film_id' = OLD.film_id::text;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_watchlist_delete ON watchlists;

CREATE TRIGGER on_watchlist_delete
AFTER DELETE ON watchlists
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_watchlist_delete();
