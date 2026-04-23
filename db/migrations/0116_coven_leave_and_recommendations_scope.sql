-- Lets either participant leave a coven by deleting the members row.
CREATE POLICY coven_members_delete ON coven_members
  FOR DELETE TO authenticated
  USING (auth.uid() IN (user_a_id, user_b_id));

-- Tighten recommendations INSERT: senders must be coven-bound with the recipient.
-- Drops the old policy (if any) and replaces it with the coven-gated version.
DROP POLICY IF EXISTS recommendations_insert ON recommendations;
CREATE POLICY recommendations_insert ON recommendations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = from_user_id
    AND EXISTS (
      SELECT 1 FROM coven_members cm
      WHERE cm.user_a_id = LEAST(from_user_id, to_user_id)
        AND cm.user_b_id = GREATEST(from_user_id, to_user_id)
    )
  );
