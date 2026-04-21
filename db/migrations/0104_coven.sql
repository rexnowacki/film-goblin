CREATE TYPE coven_request_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE coven_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        coven_request_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  UNIQUE (from_user_id, to_user_id),
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX coven_requests_to_user_id_idx ON coven_requests (to_user_id) WHERE status = 'pending';

CREATE TABLE coven_members (
  user_a_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);

ALTER TABLE coven_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE coven_members ENABLE ROW LEVEL SECURITY;

-- Requests: only the two parties see them
CREATE POLICY coven_requests_read ON coven_requests
  FOR SELECT TO authenticated
  USING (auth.uid() IN (from_user_id, to_user_id));

CREATE POLICY coven_requests_insert ON coven_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id AND status = 'pending');

-- Only recipient can update, only status + responded_at, only from pending
CREATE POLICY coven_requests_update ON coven_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = to_user_id AND status = 'pending')
  WITH CHECK (auth.uid() = to_user_id AND status IN ('accepted', 'declined'));

CREATE POLICY coven_requests_delete ON coven_requests
  FOR DELETE TO authenticated
  USING (auth.uid() IN (from_user_id, to_user_id));

-- Members: anyone can read (public close-coven graph)
CREATE POLICY coven_members_read ON coven_members
  FOR SELECT TO anon, authenticated
  USING (true);

-- No client write policies on coven_members — only the trigger (Task 16) inserts
