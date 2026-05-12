-- 0180: cached TMDB cast details for film detail pages.
--
-- Store people separately from film-specific credits so actor metadata can be
-- reused later by person pages without duplicating names/profile images.

CREATE TABLE people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  profile_path TEXT,
  known_for_department TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE film_cast (
  film_id UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  character TEXT,
  billing_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (film_id, person_id)
);

CREATE INDEX film_cast_film_order_idx ON film_cast (film_id, billing_order);
CREATE INDEX film_cast_person_idx ON film_cast (person_id);

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_cast ENABLE ROW LEVEL SECURITY;

CREATE POLICY "people public read" ON people
  FOR SELECT USING (true);

CREATE POLICY "film_cast public read" ON film_cast
  FOR SELECT USING (true);

-- Admin writes use service_role only; no INSERT/UPDATE/DELETE policies.

GRANT SELECT ON people TO anon, authenticated;
GRANT SELECT ON film_cast TO anon, authenticated;
