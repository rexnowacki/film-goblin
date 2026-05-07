-- db/migrations/0172_invite_codes.sql

-- invite_codes: one row per shareable invite link
CREATE TABLE invite_codes (
  code             TEXT PRIMARY KEY,
  owner_user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  label            TEXT,
  max_uses         INTEGER NOT NULL DEFAULT 5,
  use_count        INTEGER NOT NULL DEFAULT 0,
  revoked          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- invite_uses: one row per successful signup through an invite
CREATE TABLE invite_uses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL REFERENCES invite_codes(code),
  new_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: auto-create an invite code for every new profile
CREATE OR REPLACE FUNCTION create_invite_code_for_new_user()
RETURNS trigger AS $$
DECLARE
  new_code TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    new_code := encode(gen_random_bytes(4), 'hex');
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_profile_insert_create_invite_code
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION create_invite_code_for_new_user();

-- RPC: race-safe burn — increments use_count and records the use atomically
CREATE OR REPLACE FUNCTION burn_invite_code(p_code TEXT, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- Backfill: give every existing profile an invite code
DO $$
DECLARE
  profile_rec RECORD;
  new_code    TEXT;
  attempts    INT;
BEGIN
  FOR profile_rec IN SELECT id FROM profiles LOOP
    IF NOT EXISTS (SELECT 1 FROM invite_codes WHERE owner_user_id = profile_rec.id) THEN
      attempts := 0;
      LOOP
        new_code := encode(gen_random_bytes(4), 'hex');
        BEGIN
          INSERT INTO invite_codes (code, owner_user_id, max_uses)
          VALUES (new_code, profile_rec.id, 5);
          EXIT;
        EXCEPTION WHEN unique_violation THEN
          attempts := attempts + 1;
          IF attempts >= 10 THEN
            RAISE EXCEPTION 'Backfill: could not generate code for user %', profile_rec.id;
          END IF;
        END;
      END LOOP;
    END IF;
  END LOOP;
END $$;
