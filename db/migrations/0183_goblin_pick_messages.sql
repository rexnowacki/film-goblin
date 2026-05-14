-- 0183: messages for the "Weekly Ritual Watch" chat thread bound to each goblin pick.
-- One thread per goblin_pick row. While a pick is currently active (its effective_at is
-- the greatest <= now()), the thread accepts new messages; once a later pick takes over,
-- the thread is "archived" — read-only, derived purely from goblin_pick.effective_at.

CREATE TABLE goblin_pick_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_id     INT  NOT NULL REFERENCES goblin_pick(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  mentions    UUID[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX goblin_pick_messages_pick_created_idx
  ON goblin_pick_messages (pick_id, created_at);

CREATE INDEX goblin_pick_messages_mentions_gin_idx
  ON goblin_pick_messages USING GIN (mentions);

ALTER TABLE goblin_pick_messages ENABLE ROW LEVEL SECURITY;

-- Read: any signed-in user can see the chat. Anonymous visitors don't.
CREATE POLICY goblin_pick_messages_read ON goblin_pick_messages
  FOR SELECT TO authenticated
  USING (true);

-- Insert: signed-in user, posting as themselves. Active-pick gating is enforced
-- in the server action because the "active pick" computation requires now() and
-- a subquery; doing it in WITH CHECK works but bloats the policy. Action-layer
-- check + this row-ownership check is sufficient.
CREATE POLICY goblin_pick_messages_insert ON goblin_pick_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Delete: own messages only. No update (chat is append-only / IRC-style).
CREATE POLICY goblin_pick_messages_delete ON goblin_pick_messages
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON goblin_pick_messages TO authenticated;

-- Realtime: publish INSERTs so the chat client can subscribe and append live.
-- DEFAULT replica identity (PK only) is sufficient for INSERT events.
ALTER PUBLICATION supabase_realtime ADD TABLE goblin_pick_messages;
