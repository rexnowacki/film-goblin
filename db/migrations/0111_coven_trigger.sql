-- When a coven_request goes from 'pending' to 'accepted', insert into coven_members
-- with canonicalized pair, and emit two 'coven_joined' activity events (one per member).

CREATE OR REPLACE FUNCTION public.handle_coven_request_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lo UUID;
  hi UUID;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    lo := LEAST(NEW.from_user_id, NEW.to_user_id);
    hi := GREATEST(NEW.from_user_id, NEW.to_user_id);

    INSERT INTO public.coven_members (user_a_id, user_b_id)
    VALUES (lo, hi)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (NEW.from_user_id, 'coven_joined', jsonb_build_object('other_user_id', NEW.to_user_id));
    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (NEW.to_user_id, 'coven_joined', jsonb_build_object('other_user_id', NEW.from_user_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_coven_request_accepted
AFTER UPDATE ON coven_requests
FOR EACH ROW
EXECUTE FUNCTION public.handle_coven_request_accepted();
