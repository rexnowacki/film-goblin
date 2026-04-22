-- Fan-out triggers: source-table inserts → activity rows.

-- lists insert → list_created (only for public lists — private lists should not broadcast)
CREATE OR REPLACE FUNCTION public.activity_on_list_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.is_public THEN
    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (NEW.owner_user_id, 'list_created', jsonb_build_object('list_id', NEW.id, 'title', NEW.title));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_list_insert
AFTER INSERT ON lists
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_list_insert();

-- list_films insert → list_film_added (actor is list owner; only for public lists)
CREATE OR REPLACE FUNCTION public.activity_on_list_film_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  owner UUID;
  is_public BOOLEAN;
BEGIN
  SELECT owner_user_id, lists.is_public INTO owner, is_public FROM public.lists WHERE id = NEW.list_id;
  IF is_public THEN
    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (owner, 'list_film_added', jsonb_build_object('list_id', NEW.list_id, 'film_id', NEW.film_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_list_film_insert
AFTER INSERT ON list_films
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_list_film_insert();

-- recommendations insert → recommendation_sent
CREATE OR REPLACE FUNCTION public.activity_on_recommendation_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity (actor_user_id, kind, payload)
  VALUES (
    NEW.from_user_id,
    'recommendation_sent',
    jsonb_build_object('film_id', NEW.film_id, 'to_user_id', NEW.to_user_id, 'note', NEW.note)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_recommendation_insert
AFTER INSERT ON recommendations
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_recommendation_insert();

-- watchlists insert → watchlist_added (only if user's profile has broadcast_watchlist_adds = TRUE)
CREATE OR REPLACE FUNCTION public.activity_on_watchlist_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  broadcast BOOLEAN;
BEGIN
  SELECT broadcast_watchlist_adds INTO broadcast FROM public.profiles WHERE id = NEW.user_id;
  IF broadcast IS TRUE THEN
    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (NEW.user_id, 'watchlist_added', jsonb_build_object('film_id', NEW.film_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_watchlist_insert
AFTER INSERT ON watchlists
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_watchlist_insert();
