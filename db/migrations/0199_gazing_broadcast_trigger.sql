-- 0199_gazing_broadcast_trigger.sql
-- "Summon the coven": a gazing_invites row with broadcast = true fans out to
-- an activity (kind = 'gazing_invited') so the inviter's coven sees the
-- showtime in their feed. The existing SMS-share path inserts broadcast = false
-- and never posts. Mirrors activity_on_library_insert (0134). Depends on 0198
-- (the 'gazing_invited' enum value committed in its own transaction).

ALTER TABLE gazing_invites
  ADD COLUMN broadcast boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.activity_on_gazing_broadcast()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity (actor_user_id, kind, payload)
  VALUES (
    NEW.created_by,
    'gazing_invited',
    jsonb_build_object(
      'film_id', NEW.film_id,
      'token', NEW.token,
      'theater_name', NEW.theater_name,
      'starts_at', NEW.starts_at,
      'format_label', NEW.format_label
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_gazing_broadcast
AFTER INSERT ON gazing_invites
FOR EACH ROW
WHEN (NEW.broadcast IS TRUE)
EXECUTE FUNCTION public.activity_on_gazing_broadcast();
