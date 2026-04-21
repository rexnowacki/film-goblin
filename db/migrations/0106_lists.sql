CREATE TABLE lists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  is_public       BOOLEAN NOT NULL DEFAULT TRUE,
  is_official     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX lists_owner_user_id_idx ON lists (owner_user_id);
CREATE INDEX lists_is_public_idx ON lists (is_public) WHERE is_public = TRUE;

CREATE TABLE list_films (
  list_id         UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  film_id         UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, film_id)
);

CREATE INDEX list_films_list_id_position_idx ON list_films (list_id, position);

CREATE TABLE list_subscriptions (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  list_id         UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, list_id)
);

CREATE INDEX list_subscriptions_list_id_idx ON list_subscriptions (list_id);

ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_films ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_subscriptions ENABLE ROW LEVEL SECURITY;

-- Lists: public visible to all, private visible to owner
CREATE POLICY lists_read ON lists
  FOR SELECT TO anon, authenticated
  USING (is_public OR auth.uid() = owner_user_id);

CREATE POLICY lists_insert ON lists
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY lists_update ON lists
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY lists_delete ON lists
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_user_id);

-- list_films: inherit list visibility
CREATE POLICY list_films_read ON list_films
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM lists
    WHERE lists.id = list_films.list_id
      AND (lists.is_public OR lists.owner_user_id = auth.uid())
  ));

CREATE POLICY list_films_write ON list_films
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM lists
    WHERE lists.id = list_films.list_id AND lists.owner_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM lists
    WHERE lists.id = list_films.list_id AND lists.owner_user_id = auth.uid()
  ));

-- list_subscriptions: owner sees subscribers; subscribers see own subs; subscribe requires public list
CREATE POLICY list_subscriptions_read ON list_subscriptions
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = (SELECT owner_user_id FROM lists WHERE id = list_id)
  );

CREATE POLICY list_subscriptions_insert ON list_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM lists WHERE id = list_id AND is_public = TRUE)
  );

CREATE POLICY list_subscriptions_delete ON list_subscriptions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
