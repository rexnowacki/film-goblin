-- 0185: enforce active-thread posting in RLS, not only in the server action.
-- Clients have direct Supabase credentials, so WITH CHECK must reject inserts
-- into archived or future ritual threads even if a caller bypasses the action.

DROP POLICY IF EXISTS goblin_pick_messages_insert ON goblin_pick_messages;

CREATE POLICY goblin_pick_messages_insert ON goblin_pick_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND pick_id = (
      SELECT gp.id
      FROM goblin_pick gp
      WHERE gp.effective_at <= now()
      ORDER BY gp.effective_at DESC
      LIMIT 1
    )
  );
