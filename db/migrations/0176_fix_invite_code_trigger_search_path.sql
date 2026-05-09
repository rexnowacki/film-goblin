-- 0176_fix_invite_code_trigger_search_path.sql
--
-- Bug fix for mig 0173. That migration added `SET search_path = public` to
-- `create_invite_code_for_new_user()` (and `burn_invite_code()`) to satisfy
-- a security linter warning. But the function calls `gen_random_bytes(8)`,
-- which lives in the `extensions` schema in Supabase — not `public`.
--
-- Pinning search_path to `public` made the call unresolvable, the trigger
-- raised, the auth.users INSERT rolled back, and Supabase's auth API
-- surfaced "Database error creating new user" to every signup. (Tests in
-- film-watchers.test.ts hit the same wall.)
--
-- Fix: include `extensions` in the search_path so pgcrypto functions resolve.
-- `burn_invite_code()` doesn't need the change (no pgcrypto calls inside)
-- but we widen its search_path too for consistency and future-proofing.

ALTER FUNCTION create_invite_code_for_new_user() SET search_path = public, extensions;
ALTER FUNCTION burn_invite_code(TEXT, UUID) SET search_path = public, extensions;
