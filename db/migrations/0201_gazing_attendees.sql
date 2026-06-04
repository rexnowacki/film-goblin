-- 0201_gazing_attendees.sql
-- RSVP to a gazing. A row = an accepted summon (toggle = insert/delete).
-- Insert fans out a gazing_attending activity + a gazing_rsvp host notification;
-- delete retracts the activity (mirrors 0168 watchlist-delete cleanup).
-- Depends on 0200 (enum values committed in their own transaction).

CREATE TABLE gazing_attendees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id   uuid NOT NULL REFERENCES gazing_invites(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invite_id, user_id)
);

CREATE INDEX gazing_attendees_invite_idx ON gazing_attendees (invite_id);

ALTER TABLE gazing_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY gazing_attendees_read ON gazing_attendees
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY gazing_attendees_self_insert ON gazing_attendees
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY gazing_attendees_self_delete ON gazing_attendees
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON gazing_attendees TO authenticated;

-- Let authenticated users read broadcast invites for feed roster enrichment.
-- Private SMS-share invites stay owner-only.
CREATE POLICY gazing_invites_broadcast_read ON gazing_invites
  FOR SELECT TO authenticated
  USING (broadcast = true);

CREATE OR REPLACE FUNCTION public.activity_on_gazing_attendee_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inv gazing_invites%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.gazing_invites WHERE id = NEW.invite_id;

  INSERT INTO public.activity (actor_user_id, kind, payload)
  VALUES (
    NEW.user_id,
    'gazing_attending',
    jsonb_build_object(
      'invite_id', inv.id,
      'film_id', inv.film_id,
      'token', inv.token,
      'theater_name', inv.theater_name,
      'starts_at', inv.starts_at,
      'format_label', inv.format_label,
      'to_user_id', inv.created_by
    )
  );

  IF inv.created_by <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, kind, actor_user_id, payload)
    VALUES (
      inv.created_by,
      'gazing_rsvp',
      NEW.user_id,
      jsonb_build_object('invite_id', inv.id, 'film_id', inv.film_id, 'token', inv.token)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_gazing_attendee_insert
AFTER INSERT ON gazing_attendees
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_gazing_attendee_insert();

CREATE OR REPLACE FUNCTION public.activity_on_gazing_attendee_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.activity
  WHERE actor_user_id = OLD.user_id
    AND kind = 'gazing_attending'
    AND payload->>'invite_id' = OLD.invite_id::text;
  RETURN OLD;
END;
$$;

CREATE TRIGGER on_gazing_attendee_delete
AFTER DELETE ON gazing_attendees
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_gazing_attendee_delete();
