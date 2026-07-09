-- Keep auto-generated profile usernames within the database's 24-character
-- constraint. Metadata-backed signups already validate their chosen username;
-- this covers OAuth and other email-derived fallback paths.

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
    base_username := left(regexp_replace(lower(split_part(NEW.email, '@', 1)), '[^a-z0-9_]', '', 'g'), 24);
    IF base_username = '' THEN
      base_username := 'goblin';
    END IF;
    final_username := base_username;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(final_username)) LOOP
      suffix := suffix + 1;
      final_username := left(base_username, 24 - length(suffix::text)) || suffix::text;
    END LOOP;
    final_display := final_username;
  END IF;

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, final_username, final_display);

  RETURN NEW;
END;
$$;
