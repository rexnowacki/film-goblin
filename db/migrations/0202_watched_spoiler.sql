-- 0202_watched_spoiler.sql
-- Let users mark watch notes as spoilers. The watch_logged activity payload
-- snapshots the flag, and edits keep the matching activity row in sync.

ALTER TABLE watched
  ADD COLUMN spoiler boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.activity_on_watch_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (SELECT broadcast_watched FROM profiles WHERE id = NEW.user_id) IS TRUE THEN
    INSERT INTO activity (actor_user_id, kind, payload)
    VALUES (
      NEW.user_id,
      'watch_logged',
      jsonb_build_object(
        'film_id', NEW.film_id,
        'note', NEW.note,
        'recommended', NEW.recommended,
        'spoiler', NEW.spoiler
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_on_watch_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.note IS DISTINCT FROM OLD.note
     OR NEW.recommended IS DISTINCT FROM OLD.recommended
     OR NEW.spoiler IS DISTINCT FROM OLD.spoiler THEN
    UPDATE public.activity
       SET payload = payload
                     || jsonb_build_object('note', NEW.note)
                     || jsonb_build_object('recommended', NEW.recommended)
                     || jsonb_build_object('spoiler', NEW.spoiler)
     WHERE actor_user_id = NEW.user_id
       AND kind = 'watch_logged'
       AND payload->>'film_id' = NEW.film_id::text
       AND created_at BETWEEN NEW.created_at - INTERVAL '5 seconds'
                          AND NEW.created_at + INTERVAL '5 seconds';
  END IF;
  RETURN NEW;
END;
$$;
