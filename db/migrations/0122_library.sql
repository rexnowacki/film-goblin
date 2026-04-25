-- C1: Library — track films a user owns. Coven-visible by default
-- (gated by profiles.broadcast_library); discovery filter excludes
-- viewer's owned films from /films.

-- 1. The library table
CREATE TABLE library (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  film_id     UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, film_id)
);

CREATE INDEX library_film_id_idx ON library (film_id);
CREATE INDEX library_user_created_idx ON library (user_id, created_at DESC);

-- 2. Profile broadcast flag
ALTER TABLE profiles
  ADD COLUMN broadcast_library BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. RLS
ALTER TABLE library ENABLE ROW LEVEL SECURITY;

-- Owner always sees their own. Coven members see fellow members' rows
-- when the target has broadcast_library = TRUE.
-- coven_members is a graph-edge table: (user_a_id, user_b_id) with
-- user_a_id < user_b_id invariant. Edge between auth.uid() and
-- library.user_id can be in either direction; check both.
CREATE POLICY library_select ON library
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      EXISTS (
        SELECT 1 FROM coven_members cm
        WHERE (cm.user_a_id = auth.uid() AND cm.user_b_id = library.user_id)
           OR (cm.user_a_id = library.user_id AND cm.user_b_id = auth.uid())
      )
      AND (SELECT broadcast_library FROM profiles WHERE id = library.user_id) IS TRUE
    )
  );

CREATE POLICY library_insert ON library
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY library_delete ON library
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON library TO authenticated;

-- 4. Extend films_with_stats with owned_count for B2.
DROP VIEW IF EXISTS films_with_stats;
CREATE VIEW films_with_stats AS
SELECT
  f.id, f.itunes_id, f.title, f.director, f.year, f.runtime_min,
  f.genre_primary, f.description, f.content_advisory, f.artwork_url,
  f.itunes_url, f.tracking, f.available, f.first_seen_at,
  f.last_checked_at, f.last_priced_at,
  (SELECT count(*)::int FROM watchlists w WHERE w.film_id = f.id) AS watchlist_count,
  (SELECT count(*)::int FROM library l WHERE l.film_id = f.id) AS owned_count,
  (SELECT price_usd FROM price_history ph WHERE ph.film_id = f.id ORDER BY captured_at DESC LIMIT 1) AS latest_price
FROM films f;

GRANT SELECT ON films_with_stats TO anon, authenticated;
