-- 0184: fan @ mentions in goblin_pick_messages into per-user notifications.
-- Reads NEW.mentions (UUID[]) populated by the server action's mention parser.
-- Self-mentions are filtered. Each unique mentioned user gets one row of kind
-- 'goblin_summon' with payload referencing the message + pick.
--
-- Depends on mig 0182 (enum value 'goblin_summon' added in its own transaction).

CREATE OR REPLACE FUNCTION public.notify_goblin_summon()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  SELECT
    DISTINCT mentioned_id,
    'goblin_summon',
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

CREATE TRIGGER on_goblin_pick_message_insert_summon
AFTER INSERT ON goblin_pick_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_goblin_summon();
