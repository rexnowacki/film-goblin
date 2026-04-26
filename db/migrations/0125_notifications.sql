-- 0125_notifications.sql
-- Per-user, per-event in-app notification rows. Populated by SECURITY DEFINER
-- triggers (see 0126). Read by TopNav for the avatar-bell badge + dropdown.

CREATE TYPE notification_kind AS ENUM (
  'coven_invite_pending',
  'coven_invite_accepted',
  'recommendation_received',
  'price_drop'
);

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            notification_kind NOT NULL,
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_unread_idx
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX notifications_user_recent_idx
  ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_read ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notifications_update ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, UPDATE ON notifications TO authenticated;
-- No INSERT/DELETE for clients; triggers run as SECURITY DEFINER.
