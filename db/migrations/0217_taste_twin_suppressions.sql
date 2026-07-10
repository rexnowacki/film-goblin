-- Viewer-owned temporary exclusions from taste-twin discovery.
CREATE TABLE taste_twin_suppressions (
  viewer_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suppressed_until timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (viewer_id, candidate_id),
  CHECK (viewer_id <> candidate_id),
  CHECK (suppressed_until > created_at)
);
CREATE INDEX taste_twin_suppressions_viewer_until_idx
  ON taste_twin_suppressions (viewer_id, suppressed_until DESC);
ALTER TABLE taste_twin_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY taste_twin_suppressions_select_own ON taste_twin_suppressions
  FOR SELECT TO authenticated USING (viewer_id = auth.uid());
CREATE POLICY taste_twin_suppressions_insert_own ON taste_twin_suppressions
  FOR INSERT TO authenticated WITH CHECK (viewer_id = auth.uid());
CREATE POLICY taste_twin_suppressions_update_own ON taste_twin_suppressions
  FOR UPDATE TO authenticated USING (viewer_id = auth.uid()) WITH CHECK (viewer_id = auth.uid());
CREATE POLICY taste_twin_suppressions_delete_own ON taste_twin_suppressions
  FOR DELETE TO authenticated USING (viewer_id = auth.uid());
REVOKE ALL ON taste_twin_suppressions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON taste_twin_suppressions TO authenticated;
