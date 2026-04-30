-- 0137: rename profiles.handle -> profiles.username.
--
-- Mechanical rename, no behavior change. The unique-index on lower(handle)
-- is dropped and recreated as profiles_username_lower_idx. The on_auth_user
-- trigger (last touched in 0136) is recreated below to read
-- raw_user_meta_data->>'username' instead of ->>'handle'. Email/password
-- signups will pass 'username' in metadata; the migration ships in the same
-- PR as the auth code so ordering is theoretical, but the metadata path
-- falls back to email-derived auto-generation when the key is missing.
--
-- Slug VALUES don't change — only the column name. Existing /p/<slug> URLs
-- keep resolving once the [handle] route param is renamed to [username]
-- in the same PR.

ALTER TABLE profiles RENAME COLUMN handle TO username;

DROP INDEX IF EXISTS profiles_handle_lower_idx;
CREATE UNIQUE INDEX profiles_username_lower_idx ON profiles (lower(username));

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_username  TEXT := NEW.raw_user_meta_data->>'username';
  meta_display   TEXT := NEW.raw_user_meta_data->>'display_name';
  base_username  TEXT;
  final_username TEXT;
  final_display  TEXT;
  suffix         INTEGER := 0;
BEGIN
  IF meta_username IS NOT NULL AND meta_username ~ '^[a-z0-9._]+$' AND length(meta_username) <= 24 THEN
    final_username := meta_username;
    final_display := COALESCE(NULLIF(trim(meta_display), ''), meta_username);
  ELSE
    base_username := regexp_replace(lower(split_part(NEW.email, '@', 1)), '[^a-z0-9_]', '', 'g');
    IF base_username = '' THEN
      base_username := 'goblin';
    END IF;
    final_username := base_username;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(final_username)) LOOP
      suffix := suffix + 1;
      final_username := base_username || suffix::text;
    END LOOP;
    final_display := final_username;
  END IF;

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, final_username, final_display);

  RETURN NEW;
END;
$$;
