-- 0214_pit_impressions_digest_key.sql
-- FROM THE PIT digest events: rendering one synthetic digest records every
-- real member permanently, while digest_key lets that batch consume a single
-- daily-cap unit. NULL remains the ordinary individual-impression path.
ALTER TABLE pit_impressions ADD COLUMN digest_key text NULL;

-- A defaulted second argument is a new Postgres signature, not a replacement
-- for the existing one-argument function. Drop it first, then restore the
-- security/grant contract exactly.
DROP FUNCTION record_pit_impressions(uuid[]);

CREATE FUNCTION record_pit_impressions(
  p_event_ids uuid[],
  p_digest_key text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_event_ids IS NULL
     OR array_length(p_event_ids, 1) IS NULL
     OR array_length(p_event_ids, 1) > 10 THEN
    RETURN;
  END IF;

  INSERT INTO pit_impressions (user_id, event_id, digest_key)
  SELECT auth.uid(), e.id, p_digest_key
  FROM unnest(p_event_ids) AS ids(id)
  JOIN feed_events e ON e.id = ids.id
  ON CONFLICT (user_id, event_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION record_pit_impressions(uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_pit_impressions(uuid[], text) TO authenticated;
