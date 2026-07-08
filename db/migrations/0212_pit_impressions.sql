-- 0212_pit_impressions.sql
-- FROM THE PIT cadence caps (spec 2026-07-08-pit-cadence-caps-design.md).
-- Mirrors fyp_impressions (mig 0206) exactly in shape/RLS/RPC style, but
-- keyed on feed_events.id rather than films.id, and ON CONFLICT DO NOTHING
-- rather than incrementing a counter -- row presence alone is all this
-- table needs to express (permanent "already seen" exclusion + today's
-- distinct count).
CREATE TABLE pit_impressions (
  user_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES feed_events(id) ON DELETE CASCADE,
  shown_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

ALTER TABLE pit_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY pit_impressions_select_own ON pit_impressions
  FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON pit_impressions TO authenticated;

-- Race-safe batch insert. Unknown event ids are silently skipped (JOIN
-- feed_events) so a stale client can never error the fire-and-forget path.
-- Capped at 10 (a single feed render shows far fewer Pit items than the
-- 50-id cap fyp_impressions uses for FYP shelf posters).
CREATE OR REPLACE FUNCTION record_pit_impressions(p_event_ids uuid[])
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

  INSERT INTO pit_impressions (user_id, event_id)
  SELECT auth.uid(), e.id
  FROM unnest(p_event_ids) AS ids(id)
  JOIN feed_events e ON e.id = ids.id
  ON CONFLICT (user_id, event_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION record_pit_impressions(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_pit_impressions(uuid[]) TO authenticated;
