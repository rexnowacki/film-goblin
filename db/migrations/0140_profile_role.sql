-- 0140: profiles.role for the goblin / witch / high_goblin tier system.
--
-- Sub-project 23. Three tiers:
--   goblin       -- default; regular user. No badge.
--   witch        -- staff. Pentagram badge next to display name on /p/[username].
--   high_goblin  -- premium. Goblin-head badge. (Tier ships dormant — no
--                   billing integration yet; admin manually sets via
--                   /admin/users/[id] for now.)
--
-- Display only on the public profile page in v1; the badge does NOT
-- appear in activity rows, comments, search, etc. (Deferred to a later
-- sweep if/when the surface coverage feels half-baked.)
--
-- Permissions: clients cannot UPDATE the role column. Enforced via the
-- RLS WITH CHECK below — the new role must equal the existing row's
-- role. Service-role bypasses RLS and is the only path that can change
-- it (admin server action adminSetUserRole, gated on staff.role='admin').
--
-- Witch ↔ staff invariant: witches are typically staff. The admin
-- server action that promotes to witch ALSO inserts into staff
-- (role='admin') in the same transaction; demoting from witch removes
-- the staff row. This invariant is enforced by the action, not the DB —
-- a manual SQL UPDATE could drift the two, but we own that surface.

ALTER TABLE profiles
  ADD COLUMN role TEXT NOT NULL DEFAULT 'goblin'
    CHECK (role IN ('goblin', 'witch', 'high_goblin'));

DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );
