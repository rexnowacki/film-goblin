-- 0135: Explicit onboarded_at timestamp on profiles.
--
-- Replaces the fragile string-comparison heuristic in app/api/auth/callback
-- (handle === email.split("@")[0]) which fails for any email whose local-part
-- contains uppercase letters or punctuation, because the profile-creation
-- trigger normalizes via lower + regex_replace while the callback compared
-- against the raw local-part. With this column, the callback simply checks
-- if onboarded_at IS NULL.
--
-- Backfill: all existing profiles get onboarded_at = created_at on the
-- assumption that anyone with an account before this migration has already
-- run the old onboarding flow. New profiles created by the on_auth_user
-- trigger after this migration ran will have onboarded_at = NULL until
-- _completeOnboarding sets it.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ NULL;

UPDATE profiles
  SET onboarded_at = created_at
  WHERE onboarded_at IS NULL;
