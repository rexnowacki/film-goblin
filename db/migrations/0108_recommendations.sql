CREATE TABLE recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  film_id         UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  note            TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX recommendations_from_user_id_idx ON recommendations (from_user_id);
CREATE INDEX recommendations_to_user_id_idx ON recommendations (to_user_id);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY recommendations_read ON recommendations
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY recommendations_insert ON recommendations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id AND from_user_id <> to_user_id);

CREATE POLICY recommendations_delete ON recommendations
  FOR DELETE TO authenticated
  USING (auth.uid() IN (from_user_id, to_user_id));
