-- Web Push subscriptions + fanout trigger.
-- One push_subscriptions row per device/browser. The Settings toggle
-- subscribes/unsubscribes the current device; row existence is the state.
--
-- Fanout: AFTER INSERT on notifications fires an async pg_net POST to the
-- app's /api/push/fanout route. Fail-soft by design: if config is missing or
-- the endpoint is down, the notification insert still succeeds.
--
-- push_fanout_config holds the fanout URL + shared secret. The secret is NOT
-- in this file — insert the single row manually post-migration (see
-- docs/superpowers/plans/2026-07-03-web-push-notifications.md Task 7).

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pg_net unavailable (non-Supabase environment): %', SQLERRM;
END $$;

CREATE TABLE push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_owner_select ON push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY push_subscriptions_owner_insert ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY push_subscriptions_owner_delete ON push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON push_subscriptions TO authenticated;

-- Single-row config table. RLS enabled with NO policies and NO grants:
-- only service_role (bypasses RLS) and the SECURITY DEFINER trigger read it.
CREATE TABLE push_fanout_config (
  id     BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  url    TEXT NOT NULL,
  secret TEXT NOT NULL
);

ALTER TABLE push_fanout_config ENABLE ROW LEVEL SECURITY;

-- search_path must include `extensions`: pg_net's net.http_post lives there
-- in Supabase (same lesson as mig 0176 / pgcrypto).
CREATE OR REPLACE FUNCTION public.notify_push_fanout()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, net AS $$
DECLARE
  cfg RECORD;
BEGIN
  SELECT url, secret INTO cfg FROM push_fanout_config WHERE id;
  IF NOT FOUND THEN
    RAISE WARNING 'notify_push_fanout: push_fanout_config row missing; push skipped for notification %', NEW.id;
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := cfg.url,
      body    := jsonb_build_object('notification_id', NEW.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || cfg.secret
      )
    );
  EXCEPTION WHEN undefined_function THEN
    RAISE WARNING 'notify_push_fanout: net.http_post unavailable (pg_net not installed); push skipped for notification %', NEW.id;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_notification_insert_push
AFTER INSERT ON notifications
FOR EACH ROW EXECUTE FUNCTION public.notify_push_fanout();
