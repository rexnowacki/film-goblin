CREATE TABLE profiles (
  id                        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle                    TEXT NOT NULL,
  display_name              TEXT NOT NULL,
  bio                       TEXT NOT NULL DEFAULT '',
  avatar_url                TEXT NOT NULL DEFAULT '',
  broadcast_watchlist_adds  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX profiles_handle_lower_idx ON profiles (lower(handle));

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Read: anyone (including anon) can see any profile
CREATE POLICY profiles_read ON profiles
  FOR SELECT TO anon, authenticated
  USING (true);

-- Update: only the profile owner, and only on mutable columns
CREATE POLICY profiles_update ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Insert/delete: no client policy. Inserts happen via the bootstrap trigger
-- (Task 15) or service-role; deletes cascade from auth.users.
