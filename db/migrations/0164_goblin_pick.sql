-- Single-row table that stores the current "Goblin Recommends" pick on /home.
-- id is locked to 1 via CHECK so there can only ever be one row.
CREATE TABLE goblin_pick (
  id       INT PRIMARY KEY DEFAULT 1,
  film_id  UUID NOT NULL REFERENCES films(id),
  set_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  set_by   UUID REFERENCES profiles(id),
  CONSTRAINT goblin_pick_single_row CHECK (id = 1)
);

ALTER TABLE goblin_pick ENABLE ROW LEVEL SECURITY;

-- Readable by anyone — home feed is public, visitors can see the pick.
CREATE POLICY goblin_pick_select_all ON goblin_pick
  FOR SELECT USING (true);

-- Writable by admin staff only.
CREATE POLICY goblin_pick_admin_write ON goblin_pick
  FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK(EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'));

-- Seed with WEAPONS if it already exists in the catalog.
INSERT INTO goblin_pick (film_id)
SELECT id FROM films WHERE lower(title) = 'weapons' LIMIT 1
ON CONFLICT (id) DO NOTHING;
