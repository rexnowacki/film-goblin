CREATE TYPE review_status AS ENUM ('draft', 'published');

CREATE TABLE reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id         UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  author_user_id  UUID NOT NULL REFERENCES staff(user_id) ON DELETE RESTRICT,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  pullquote       TEXT NOT NULL DEFAULT '',
  status          review_status NOT NULL DEFAULT 'draft',
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reviews_film_id_idx ON reviews (film_id) WHERE status = 'published';
CREATE INDEX reviews_author_idx ON reviews (author_user_id);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Read: published is world-visible; drafts only visible to their author (staff)
CREATE POLICY reviews_read_published ON reviews
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY reviews_read_own_drafts ON reviews
  FOR SELECT TO authenticated
  USING (
    status = 'draft'
    AND author_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid())
  );

-- Insert/update: author is staff and acts as themselves
CREATE POLICY reviews_insert ON reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid())
  );

CREATE POLICY reviews_update ON reviews
  FOR UPDATE TO authenticated
  USING (
    author_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid())
  )
  WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid())
  );

-- Delete: admins only
CREATE POLICY reviews_delete ON reviews
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'));
