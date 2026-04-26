-- 0127_notifications_delete_policy.sql
-- Lets users hard-delete their own notification rows. Powers the
-- "Clear all" button in the bell dropdown.

CREATE POLICY notifications_delete ON notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT DELETE ON notifications TO authenticated;
