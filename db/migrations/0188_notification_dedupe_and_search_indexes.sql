-- 0188: make ritual mention notification inserts idempotent and speed up
-- substring typeahead searches as the user/film catalogs grow.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DELETE FROM notifications n
USING notifications older
WHERE n.kind = 'goblin_summon'
  AND older.kind = 'goblin_summon'
  AND n.user_id = older.user_id
  AND n.payload->>'message_id' = older.payload->>'message_id'
  AND n.ctid > older.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_goblin_summon_once
  ON notifications (user_id, kind, ((payload->>'message_id')))
  WHERE kind = 'goblin_summon' AND payload ? 'message_id';

CREATE INDEX IF NOT EXISTS profiles_username_trgm_idx
  ON profiles USING GIN (username gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_display_name_trgm_idx
  ON profiles USING GIN (display_name gin_trgm_ops)
  WHERE display_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS films_title_trgm_idx
  ON films USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS films_director_trgm_idx
  ON films USING GIN (director gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.notify_goblin_summon()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  SELECT
    DISTINCT mentioned.mentioned_id,
    'goblin_summon'::notification_kind,
    NEW.user_id,
    jsonb_build_object(
      'pick_id',    NEW.pick_id,
      'message_id', NEW.id,
      'body',       NEW.body
    )
  FROM unnest(NEW.mentions) AS mentioned(mentioned_id)
  WHERE mentioned.mentioned_id <> NEW.user_id
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
