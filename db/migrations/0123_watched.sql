-- C2: Watched — event-stream diary of films a user has watched. Event-shaped
-- (multiple rows per (user, film) for rewatches), distinct from C1's flag-shaped
-- library. Coven-visible by default (gated by profiles.broadcast_watched).

-- 1. The watched event-stream table
CREATE TABLE watched (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  film_id     UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  watched_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX watched_user_watched_idx ON watched (user_id, watched_at DESC, created_at DESC);
CREATE INDEX watched_user_film_idx    ON watched (user_id, film_id);
CREATE INDEX watched_film_idx         ON watched (film_id);

-- 2. Profile broadcast flag (mirrors broadcast_watchlist_adds, broadcast_library)
ALTER TABLE profiles
  ADD COLUMN broadcast_watched BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Activity kind extension. Must commit before a function references the new
-- value — that's why the trigger lives in a separate migration (0124).
ALTER TYPE activity_kind ADD VALUE 'watch_logged';

-- 4. RLS — owner-or-coven-with-flag for SELECT; owner-only for I/U/D
ALTER TABLE watched ENABLE ROW LEVEL SECURITY;

CREATE POLICY watched_select ON watched
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      EXISTS (
        SELECT 1 FROM coven_members cm
        WHERE (cm.user_a_id = auth.uid() AND cm.user_b_id = watched.user_id)
           OR (cm.user_a_id = watched.user_id AND cm.user_b_id = auth.uid())
      )
      AND (SELECT broadcast_watched FROM profiles WHERE id = watched.user_id) IS TRUE
    )
  );

CREATE POLICY watched_insert ON watched
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY watched_update ON watched
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY watched_delete ON watched
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON watched TO authenticated;
