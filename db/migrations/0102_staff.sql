CREATE TYPE staff_role AS ENUM ('reviewer', 'admin');

CREATE TABLE staff (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        staff_role NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- Read: anyone; UI shows staff badges
CREATE POLICY staff_read ON staff
  FOR SELECT TO anon, authenticated
  USING (true);

-- No client write policies. Staff are provisioned via service-role.
