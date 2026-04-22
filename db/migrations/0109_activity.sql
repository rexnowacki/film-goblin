CREATE TYPE activity_kind AS ENUM (
  'review_published',
  'recommendation_sent',
  'watchlist_added',
  'list_created',
  'list_film_added',
  'coven_joined'
);

CREATE TABLE activity (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            activity_kind NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activity_actor_user_id_created_at_idx ON activity (actor_user_id, created_at DESC);
CREATE INDEX activity_created_at_idx ON activity (created_at DESC);

ALTER TABLE activity ENABLE ROW LEVEL SECURITY;

-- Read: anyone. Privacy is at the source tables — we only insert events already public.
CREATE POLICY activity_read ON activity
  FOR SELECT TO anon, authenticated
  USING (true);

-- No client insert/update/delete policies — only triggers (SECURITY DEFINER) and service-role write
