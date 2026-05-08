-- 0174_must_change_password.sql
--
-- Adds a per-profile flag the admin sets when forcing a password reset
-- via the new "Set temp password" admin button. The middleware reads this
-- flag every request; when true, the user is redirected to
-- /auth/change-password until they pick a new password (which clears it).
--
-- Default false — existing rows get false on backfill via the column default.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
