-- Allow manual-entry films that have no iTunes listing.
ALTER TABLE films ALTER COLUMN itunes_id DROP NOT NULL;

-- Replace the old UNIQUE constraint with a partial unique index
-- so multiple NULL-itunes-id rows can coexist.
ALTER TABLE films DROP CONSTRAINT films_itunes_id_key;
CREATE UNIQUE INDEX films_itunes_id_unique
  ON films (itunes_id)
  WHERE itunes_id IS NOT NULL;

-- Bring films onto the same RLS footing as every other public table.
ALTER TABLE films ENABLE ROW LEVEL SECURITY;

-- Public read — the app has always assumed anyone can read films.
DROP POLICY IF EXISTS films_public_read ON films;
CREATE POLICY films_public_read ON films
  FOR SELECT TO anon, authenticated
  USING (true);

-- Admin writes — mirrors the pattern used in 0107_reviews.sql.
DROP POLICY IF EXISTS films_admin_write ON films;
CREATE POLICY films_admin_write ON films
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'));
