-- 0215_product_events.sql
-- Small first-party behavioral event stream for Return Rituals.
-- Authenticated users may read their own events; writes are RPC-only.

CREATE TABLE product_events (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid NOT NULL,
  event_name    text NOT NULL CHECK (event_name IN (
    'session_started',
    'return_contract_viewed',
    'return_contract_acted',
    'taste_twin_viewed',
    'taste_twin_request_sent',
    'gazing_created',
    'gazing_rsvp_changed',
    'gazing_reminder_opened',
    'gazing_closed',
    'attendance_confirmed',
    'aftermath_verdict_recorded',
    'continuation_prompt_viewed',
    'continuation_prompt_acted'
  )),
  path          text CHECK (path IS NULL OR char_length(path) BETWEEN 1 AND 240),
  subject_type  text CHECK (subject_type IS NULL OR char_length(subject_type) BETWEEN 1 AND 40),
  subject_id    uuid,
  properties    jsonb NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(properties) = 'object')
                CHECK (octet_length(properties::text) <= 2048),
  occurred_at   timestamptz NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_events_user_occurred_idx
  ON product_events (user_id, occurred_at DESC);
CREATE INDEX product_events_name_occurred_idx
  ON product_events (event_name, occurred_at DESC);
CREATE INDEX product_events_subject_idx
  ON product_events (subject_type, subject_id)
  WHERE subject_id IS NOT NULL;

ALTER TABLE product_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_events_select_own ON product_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON product_events FROM anon, authenticated;
GRANT SELECT ON product_events TO authenticated;

CREATE OR REPLACE FUNCTION record_product_events(events jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  event_count integer;
  inserted_count integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF events IS NULL OR jsonb_typeof(events) <> 'array' THEN
    RAISE EXCEPTION 'events must be an array';
  END IF;

  event_count := jsonb_array_length(events);
  IF event_count < 1 OR event_count > 20 THEN
    RAISE EXCEPTION 'event batch must contain 1 to 20 rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(events) AS e(value)
    WHERE jsonb_typeof(e.value) <> 'object'
      OR NOT (e.value ?& ARRAY['event_id', 'event_name', 'session_id', 'occurred_at'])
      OR (e.value->>'event_name') NOT IN (
        'session_started', 'return_contract_viewed', 'return_contract_acted',
        'taste_twin_viewed', 'taste_twin_request_sent', 'gazing_created',
        'gazing_rsvp_changed', 'gazing_reminder_opened', 'gazing_closed',
        'attendance_confirmed', 'aftermath_verdict_recorded',
        'continuation_prompt_viewed', 'continuation_prompt_acted'
      )
      OR COALESCE(jsonb_typeof(e.value->'properties'), 'object') <> 'object'
      OR octet_length(COALESCE(e.value->'properties', '{}'::jsonb)::text) > 2048
      OR char_length(COALESCE(e.value->>'path', '')) > 240
      OR COALESCE(e.value->>'path', '/') !~ '^/[^?#]*$'
      OR char_length(COALESCE(e.value->>'subject_type', '')) > 40
      OR CASE e.value->>'event_name'
        WHEN 'taste_twin_viewed' THEN e.value->>'subject_type' IS DISTINCT FROM 'profile' OR NULLIF(e.value->>'subject_id', '') IS NULL
        WHEN 'taste_twin_request_sent' THEN e.value->>'subject_type' IS DISTINCT FROM 'profile' OR NULLIF(e.value->>'subject_id', '') IS NULL
        WHEN 'gazing_created' THEN e.value->>'subject_type' IS DISTINCT FROM 'gazing_invite' OR NULLIF(e.value->>'subject_id', '') IS NULL
        WHEN 'gazing_rsvp_changed' THEN e.value->>'subject_type' IS DISTINCT FROM 'gazing_invite' OR NULLIF(e.value->>'subject_id', '') IS NULL
        WHEN 'gazing_reminder_opened' THEN e.value->>'subject_type' IS DISTINCT FROM 'gazing_invite' OR NULLIF(e.value->>'subject_id', '') IS NULL
        WHEN 'gazing_closed' THEN e.value->>'subject_type' IS DISTINCT FROM 'gazing_invite' OR NULLIF(e.value->>'subject_id', '') IS NULL
        WHEN 'attendance_confirmed' THEN e.value->>'subject_type' IS DISTINCT FROM 'gazing_invite' OR NULLIF(e.value->>'subject_id', '') IS NULL
        WHEN 'aftermath_verdict_recorded' THEN e.value->>'subject_type' IS DISTINCT FROM 'gazing_invite' OR NULLIF(e.value->>'subject_id', '') IS NULL
        ELSE NULLIF(e.value->>'subject_type', '') IS NOT NULL
          OR NULLIF(e.value->>'subject_id', '') IS NOT NULL
      END
      OR (e.value->>'occurred_at')::timestamptz < now() - interval '24 hours'
      OR (e.value->>'occurred_at')::timestamptz > now() + interval '5 minutes'
      OR EXISTS (
        SELECT 1
        FROM jsonb_object_keys(COALESCE(e.value->'properties', '{}'::jsonb)) AS k(key)
        WHERE k.key <> ALL (
          CASE e.value->>'event_name'
            WHEN 'session_started' THEN ARRAY['entry_source']
            WHEN 'return_contract_viewed' THEN ARRAY['contract_kind', 'contract_key']
            WHEN 'return_contract_acted' THEN ARRAY['contract_kind', 'contract_key', 'action']
            WHEN 'taste_twin_viewed' THEN ARRAY['source']
            WHEN 'taste_twin_request_sent' THEN ARRAY['source']
            WHEN 'gazing_created' THEN ARRAY['venue_kind', 'audience']
            WHEN 'gazing_rsvp_changed' THEN ARRAY['attending']
            WHEN 'gazing_reminder_opened' THEN ARRAY['reminder_kind', 'source']
            WHEN 'gazing_closed' THEN ARRAY['status']
            WHEN 'attendance_confirmed' THEN ARRAY[]::text[]
            WHEN 'aftermath_verdict_recorded' THEN ARRAY['recommended']
            WHEN 'continuation_prompt_viewed' THEN ARRAY['source_action', 'continuation_kind']
            WHEN 'continuation_prompt_acted' THEN ARRAY['source_action', 'continuation_kind']
            ELSE ARRAY[]::text[]
          END
        )
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_each(COALESCE(e.value->'properties', '{}'::jsonb)) AS p(key, property_value)
        WHERE jsonb_typeof(p.property_value) NOT IN ('string', 'number', 'boolean', 'null')
           OR (
             jsonb_typeof(p.property_value) = 'string'
             AND char_length(p.property_value #>> '{}') > 128
           )
      )
  ) THEN
    RAISE EXCEPTION 'invalid product event';
  END IF;

  INSERT INTO product_events (
    id, user_id, session_id, event_name, path, subject_type, subject_id,
    properties, occurred_at
  )
  SELECT
    (e.value->>'event_id')::uuid,
    caller,
    (e.value->>'session_id')::uuid,
    e.value->>'event_name',
    NULLIF(e.value->>'path', ''),
    NULLIF(e.value->>'subject_type', ''),
    NULLIF(e.value->>'subject_id', '')::uuid,
    COALESCE(e.value->'properties', '{}'::jsonb),
    (e.value->>'occurred_at')::timestamptz
  FROM jsonb_array_elements(events) AS e(value)
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION record_product_events(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_product_events(jsonb) TO authenticated;
