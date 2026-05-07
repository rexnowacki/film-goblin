-- db/migrations/0170_film_requests.sql

-- Extend the notification_kind enum
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'film_request_fulfilled';

-- film_requests: one row per unique requested film
CREATE TABLE film_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  itunes_id         BIGINT,
  tmdb_id           INT,
  title             TEXT        NOT NULL,
  year              INT,
  artwork_url       TEXT,
  director          TEXT,
  description       TEXT,
  runtime_min       INT,
  genre_primary     TEXT,
  content_advisory  TEXT,
  itunes_url        TEXT,
  source            TEXT        NOT NULL CHECK (source IN ('itunes', 'tmdb', 'manual')),
  needs_itunes_id   BOOLEAN     NOT NULL DEFAULT false,
  request_count     INT         NOT NULL DEFAULT 1,
  status            TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled')),
  fulfilled_film_id UUID        REFERENCES films(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- film_request_users: who requested what
CREATE TABLE film_request_users (
  request_id  UUID        NOT NULL REFERENCES film_requests(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);

-- notification opt-out
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_film_requests BOOLEAN NOT NULL DEFAULT true;

-- RLS: film_requests
ALTER TABLE film_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can insert film_requests"
  ON film_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "users can read their own requested films"
  ON film_requests FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT request_id FROM film_request_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "staff can manage film_requests"
  ON film_requests FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('witch', 'high_goblin'))
  );

-- RLS: film_request_users
ALTER TABLE film_request_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can insert their own film_request_users rows"
  ON film_request_users FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users can read their own film_request_users rows"
  ON film_request_users FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "staff can read all film_request_users"
  ON film_request_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('witch', 'high_goblin'))
  );
