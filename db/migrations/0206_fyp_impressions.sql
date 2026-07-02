-- 0206_fyp_impressions.sql
-- FYP impression tracking (sub-project: FYP Discover Shelves).
-- Users SELECT their own rows; all writes go through the RPC.

CREATE TABLE fyp_impressions (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  impressions int NOT NULL DEFAULT 1,
  first_shown_at timestamptz NOT NULL DEFAULT now(),
  last_shown_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, film_id)
);

ALTER TABLE fyp_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY fyp_impressions_select_own ON fyp_impressions
  FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON fyp_impressions TO authenticated;

-- Race-safe batch upsert. Unknown film ids are silently skipped (JOIN films)
-- so a stale client can never error the fire-and-forget path. Caps at 50 ids.
CREATE OR REPLACE FUNCTION record_fyp_impressions(p_film_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_film_ids IS NULL
     OR array_length(p_film_ids, 1) IS NULL
     OR array_length(p_film_ids, 1) > 50 THEN
    RETURN;
  END IF;

  INSERT INTO fyp_impressions (user_id, film_id)
  SELECT auth.uid(), f.id
  FROM unnest(p_film_ids) AS ids(id)
  JOIN films f ON f.id = ids.id
  ON CONFLICT (user_id, film_id) DO UPDATE
    SET impressions = fyp_impressions.impressions + 1,
        last_shown_at = now();
END;
$$;

REVOKE ALL ON FUNCTION record_fyp_impressions(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_fyp_impressions(uuid[]) TO authenticated;
