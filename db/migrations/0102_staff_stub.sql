-- Stub staff table. Task 7 (DB-T7) will DROP and recreate this with RLS policies
-- and a proper role enum. This stub exists so that the shared seedFixtures helper
-- (used by profiles tests) can insert staff rows without failing.

CREATE TABLE staff (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL
);
