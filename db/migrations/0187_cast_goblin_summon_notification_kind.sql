-- 0187: fix goblin summon trigger on Postgres installs that do not infer the
-- enum type for a string literal inside INSERT ... SELECT.

CREATE OR REPLACE FUNCTION public.notify_goblin_summon()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  SELECT
    DISTINCT mentioned_id,
    'goblin_summon'::notification_kind,
    NEW.user_id,
    jsonb_build_object(
      'pick_id',    NEW.pick_id,
      'message_id', NEW.id,
      'body',       NEW.body
    )
  FROM unnest(NEW.mentions) AS mentioned_id
  WHERE mentioned_id <> NEW.user_id;

  RETURN NEW;
END;
$$;
