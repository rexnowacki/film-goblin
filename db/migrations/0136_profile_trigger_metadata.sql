-- 0136: profile trigger reads handle + display_name from auth metadata.
--
-- Email/password signups now pass the user's chosen handle + display_name
-- via auth.signUp options.data, which lands in auth.users.raw_user_meta_data.
-- The trigger reads them when present and validates the handle. OAuth signups
-- (Google) don't pass metadata; the trigger falls back to today's email-derived
-- auto-generation with collision suffix loop, identical to pre-0136 behavior.
--
-- Metadata-path does NOT do the suffix-loop because uniqueness is pre-checked
-- in the signUp server action via the service-role client before auth.signUp
-- is called. If the pre-check is stale (rare race), the unique index on
-- profiles.handle throws and the auth.users INSERT fails — surfaces to the
-- user as a generic signup error. Acceptable rare edge case.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_handle  TEXT := NEW.raw_user_meta_data->>'handle';
  meta_display TEXT := NEW.raw_user_meta_data->>'display_name';
  base_handle  TEXT;
  final_handle TEXT;
  final_display TEXT;
  suffix       INTEGER := 0;
BEGIN
  IF meta_handle IS NOT NULL AND meta_handle ~ '^[a-z0-9._]+$' AND length(meta_handle) <= 24 THEN
    final_handle := meta_handle;
    final_display := COALESCE(NULLIF(trim(meta_display), ''), meta_handle);
  ELSE
    base_handle := regexp_replace(lower(split_part(NEW.email, '@', 1)), '[^a-z0-9_]', '', 'g');
    IF base_handle = '' THEN
      base_handle := 'goblin';
    END IF;
    final_handle := base_handle;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(handle) = lower(final_handle)) LOOP
      suffix := suffix + 1;
      final_handle := base_handle || suffix::text;
    END LOOP;
    final_display := final_handle;
  END IF;

  INSERT INTO public.profiles (id, handle, display_name)
  VALUES (NEW.id, final_handle, final_display);

  RETURN NEW;
END;
$$;
