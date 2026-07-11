-- Closed gazings remain readable history. Scheduled gazings accept RSVP
-- changes; scheduled/happened gazings accept attendance confirmation; a
-- cancelled gazing accepts neither. Host confirmation is an INSERT because a
-- host normally has no RSVP row, including after the host marks it happened.

DROP POLICY IF EXISTS gazing_attendees_self_insert ON gazing_attendees;
DROP POLICY IF EXISTS gazing_attendees_self_delete ON gazing_attendees;
DROP POLICY IF EXISTS gazing_attendees_self_update ON gazing_attendees;

CREATE POLICY gazing_attendees_self_insert ON gazing_attendees
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_view_gazing(invite_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM gazing_invites gi
      WHERE gi.id = invite_id
        AND (
          gi.status = 'scheduled'
          OR (
            gi.status = 'happened'
            AND gi.created_by = auth.uid()
            AND attended_at IS NOT NULL
          )
        )
    )
  );

CREATE POLICY gazing_attendees_self_delete ON gazing_attendees
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM gazing_invites gi
      WHERE gi.id = invite_id
        AND gi.status = 'scheduled'
    )
  );

CREATE POLICY gazing_attendees_self_update ON gazing_attendees
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM gazing_invites gi
      WHERE gi.id = invite_id
        AND gi.status IN ('scheduled', 'happened')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND attended_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM gazing_invites gi
      WHERE gi.id = invite_id
        AND gi.status IN ('scheduled', 'happened')
    )
  );
