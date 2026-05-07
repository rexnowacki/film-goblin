-- 0173: Fix three issues from 0172_invite_codes.sql
--
-- 1. Add UNIQUE(code, new_user_id) to invite_uses — prevents double-burn
-- 2. Recreate both SECURITY DEFINER functions with SET search_path = public
-- 3. Update trigger function to use 8 random bytes (16 hex chars) for codes

ALTER TABLE invite_uses
  ADD CONSTRAINT invite_uses_code_user_unique UNIQUE (code, new_user_id);

CREATE OR REPLACE FUNCTION create_invite_code_for_new_user()
RETURNS trigger AS $$
DECLARE
  new_code TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    new_code := encode(gen_random_bytes(8), 'hex');
    BEGIN
      INSERT INTO invite_codes (code, owner_user_id, max_uses)
      VALUES (new_code, NEW.id, 5);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      attempts := attempts + 1;
      IF attempts >= 10 THEN
        RAISE EXCEPTION 'Could not generate unique invite code after 10 attempts';
      END IF;
    END;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION burn_invite_code(p_code TEXT, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE invite_codes
  SET use_count = use_count + 1
  WHERE code = p_code
    AND NOT revoked
    AND use_count < max_uses;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  IF rows_updated > 0 THEN
    INSERT INTO invite_uses (code, new_user_id) VALUES (p_code, p_user_id);
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;
