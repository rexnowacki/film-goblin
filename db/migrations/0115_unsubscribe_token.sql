ALTER TABLE profiles
  ADD COLUMN unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX profiles_unsubscribe_token_idx
  ON profiles (unsubscribe_token);
