-- 0171: Fix three issues in the film_requests schema introduced by mig 0170.
--
-- 1. Replace wrong staff RLS pattern (profiles.role) with correct one (staff table).
--    profiles.role is a badge/tier system; staff table is the authorization gate.
-- 2. Add missing index on film_request_users.user_id (needed by RLS SELECT USING clause).
-- 3. Add missing updated_at auto-maintenance trigger on film_requests.

-- ─── 1. Fix RLS policies on film_requests ────────────────────────────────────

DROP POLICY IF EXISTS "staff can manage film_requests" ON film_requests;

CREATE POLICY "staff can manage film_requests"
  ON film_requests FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ─── 2. Fix RLS policies on film_request_users ───────────────────────────────

DROP POLICY IF EXISTS "staff can read all film_request_users" ON film_request_users;

CREATE POLICY "staff can read all film_request_users"
  ON film_request_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ─── 3. Index on film_request_users.user_id ──────────────────────────────────

CREATE INDEX IF NOT EXISTS film_request_users_user_id_idx
  ON film_request_users (user_id);

-- ─── 4. updated_at trigger on film_requests ──────────────────────────────────

CREATE OR REPLACE FUNCTION film_requests_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER film_requests_updated_at_trg
  BEFORE UPDATE ON film_requests
  FOR EACH ROW EXECUTE FUNCTION film_requests_set_updated_at();
