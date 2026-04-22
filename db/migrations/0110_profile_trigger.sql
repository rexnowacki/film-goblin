-- Bootstrap: when auth.users gets a new row, create a matching profiles row.
-- Uses SECURITY DEFINER to bypass RLS on profiles (which has no insert policy).

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_handle TEXT;
  final_handle TEXT;
  suffix INTEGER := 0;
BEGIN
  -- Derive handle from email local-part, lowercased, alphanumeric only
  base_handle := regexp_replace(lower(split_part(NEW.email, '@', 1)), '[^a-z0-9_]', '', 'g');
  IF base_handle = '' THEN
    base_handle := 'goblin';
  END IF;
  final_handle := base_handle;

  -- De-dup by suffix if colliding on lower(handle) index
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(handle) = lower(final_handle)) LOOP
    suffix := suffix + 1;
    final_handle := base_handle || suffix::text;
  END LOOP;

  INSERT INTO public.profiles (id, handle, display_name)
  VALUES (NEW.id, final_handle, final_handle);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();
