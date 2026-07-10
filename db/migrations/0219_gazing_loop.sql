-- One gazing model for theatrical screenings and scheduled home watch nights.

ALTER TABLE gazing_invites
  ADD COLUMN venue_kind text NOT NULL DEFAULT 'theater',
  ADD COLUMN status text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN reminder_24h_sent_at timestamptz,
  ADD COLUMN reminder_2h_sent_at timestamptz,
  ADD COLUMN aftermath_sent_at timestamptz,
  ADD COLUMN location_note text,
  ADD COLUMN timezone_label text NOT NULL DEFAULT 'America/Phoenix';

ALTER TABLE gazing_invites
  ALTER COLUMN theater_name DROP NOT NULL,
  ALTER COLUMN tickets_url DROP NOT NULL;

ALTER TABLE gazing_invites
  ADD CONSTRAINT gazing_invites_venue_kind_check CHECK (venue_kind IN ('theater', 'home')),
  ADD CONSTRAINT gazing_invites_status_check CHECK (status IN ('scheduled', 'happened', 'cancelled')),
  ADD CONSTRAINT gazing_invites_location_length_check CHECK (location_note IS NULL OR char_length(location_note) <= 240),
  ADD CONSTRAINT gazing_invites_timezone_length_check CHECK (char_length(timezone_label) BETWEEN 1 AND 80),
  ADD CONSTRAINT gazing_invites_venue_fields_check CHECK (
    (venue_kind = 'theater' AND theater_name IS NOT NULL AND tickets_url IS NOT NULL)
    OR (venue_kind = 'home' AND film_id IS NOT NULL AND starts_at IS NOT NULL)
  ),
  ADD CONSTRAINT gazing_invites_closure_check CHECK (
    (status = 'scheduled' AND closed_at IS NULL AND closed_by IS NULL)
    OR (status IN ('happened', 'cancelled') AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION prevent_gazing_reopen()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('happened', 'cancelled') AND NEW.status = 'scheduled' THEN
    RAISE EXCEPTION 'closed gazings cannot be reopened';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER gazing_invites_no_reopen BEFORE UPDATE ON gazing_invites
FOR EACH ROW EXECUTE FUNCTION prevent_gazing_reopen();

CREATE TABLE gazing_invitees (
  invite_id uuid NOT NULL REFERENCES gazing_invites(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invite_id, user_id)
);
CREATE INDEX gazing_invitees_user_idx ON gazing_invitees (user_id, created_at DESC);
ALTER TABLE gazing_invitees ENABLE ROW LEVEL SECURITY;

ALTER TABLE gazing_attendees ADD COLUMN attended_at timestamptz;

CREATE OR REPLACE FUNCTION public.can_view_gazing(p_invite_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM gazing_invites gi
    WHERE gi.id = p_invite_id AND (
      gi.created_by = p_user_id
      OR EXISTS (SELECT 1 FROM gazing_invitees x WHERE x.invite_id = gi.id AND x.user_id = p_user_id)
      OR EXISTS (SELECT 1 FROM gazing_attendees a WHERE a.invite_id = gi.id AND a.user_id = p_user_id)
      OR (gi.broadcast AND EXISTS (
        SELECT 1 FROM coven_members cm WHERE
          (cm.user_a_id = gi.created_by AND cm.user_b_id = p_user_id)
          OR (cm.user_b_id = gi.created_by AND cm.user_a_id = p_user_id)
      ))
    )
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_gazing(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_gazing(uuid, uuid) TO authenticated;

DROP POLICY gazing_invites_broadcast_read ON gazing_invites;
CREATE POLICY gazing_invites_participant_read ON gazing_invites
  FOR SELECT TO authenticated USING (public.can_view_gazing(id, auth.uid()));
CREATE POLICY gazing_invites_owner_update ON gazing_invites
  FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE POLICY gazing_invitees_participant_read ON gazing_invitees
  FOR SELECT TO authenticated USING (public.can_view_gazing(invite_id, auth.uid()));
CREATE POLICY gazing_invitees_host_insert ON gazing_invitees
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM gazing_invites gi WHERE gi.id = invite_id AND gi.created_by = auth.uid())
    AND user_id <> auth.uid()
  );
CREATE POLICY gazing_invitees_host_delete ON gazing_invitees
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM gazing_invites gi WHERE gi.id = invite_id AND gi.created_by = auth.uid())
  );
GRANT SELECT, INSERT, DELETE ON gazing_invitees TO authenticated;

DROP POLICY gazing_attendees_read ON gazing_attendees;
DROP POLICY gazing_attendees_self_insert ON gazing_attendees;
CREATE POLICY gazing_attendees_participant_read ON gazing_attendees
  FOR SELECT TO authenticated USING (public.can_view_gazing(invite_id, auth.uid()));
CREATE POLICY gazing_attendees_self_insert ON gazing_attendees
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.can_view_gazing(invite_id, auth.uid()));
CREATE POLICY gazing_attendees_self_update ON gazing_attendees
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT UPDATE (status, closed_at, closed_by) ON gazing_invites TO authenticated;
GRANT UPDATE (attended_at) ON gazing_attendees TO authenticated;

CREATE INDEX gazing_invites_reminder_due_idx ON gazing_invites (status, starts_at)
  WHERE status = 'scheduled';

CREATE OR REPLACE FUNCTION public.activity_on_gazing_broadcast()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.activity(actor_user_id,kind,payload) VALUES(NEW.created_by,'gazing_invited',jsonb_build_object('invite_id',NEW.id,'film_id',NEW.film_id,'token',NEW.token,'theater_name',COALESCE(NEW.theater_name,'Home watch'),'starts_at',NEW.starts_at,'format_label',NEW.format_label,'venue_kind',NEW.venue_kind));
  RETURN NEW;
END;
$$;
