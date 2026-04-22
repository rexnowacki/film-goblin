-- Fires exactly once: when a review's status transitions from 'draft' to 'published'.
-- Uses NEW.published_at as the activity timestamp (not created_at), because the
-- published moment is what the feed cares about.

CREATE OR REPLACE FUNCTION public.activity_on_review_published()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'published' THEN
    INSERT INTO public.activity (actor_user_id, kind, payload, created_at)
    VALUES (
      NEW.author_user_id,
      'review_published',
      jsonb_build_object('review_id', NEW.id, 'film_id', NEW.film_id, 'title', NEW.title),
      COALESCE(NEW.published_at, now())
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_review_published
AFTER UPDATE ON reviews
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_review_published();
