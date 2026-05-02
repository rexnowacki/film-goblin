-- 0151: tag content infrastructure for the eventual FYP recommender
-- (sub-project #32 / docs/superpowers/specs/2026-05-01-tag-content-infrastructure-design.md).
--
-- Two-table normalized model: `tags` is the canonical vocabulary,
-- `film_tags` is the join. Composite PK on the join (matches library
-- and activity_comment_reactions precedents). Public read; writes via
-- service-role from staff-checked server actions (no client grants).
--
-- Seeds 18 horror sub-genres + 36 vibe tags. Director continues to live
-- on films.director (not duplicated as a tag). All films start untagged;
-- admin curates film-by-film via /admin/films/[id]/edit.

CREATE TABLE tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL CHECK (type IN ('subgenre', 'vibe')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE film_tags (
  film_id     UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (film_id, tag_id)
);

CREATE INDEX idx_film_tags_tag ON film_tags (tag_id);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tags_select_all ON tags
  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY film_tags_select_all ON film_tags
  FOR SELECT TO authenticated, anon USING (true);

GRANT SELECT ON tags TO authenticated, anon;
GRANT SELECT ON film_tags TO authenticated, anon;

INSERT INTO tags (name, type) VALUES
  ('body horror',          'subgenre'),
  ('cosmic horror',        'subgenre'),
  ('creature feature',     'subgenre'),
  ('cursed media',         'subgenre'),
  ('folk horror',          'subgenre'),
  ('found footage',        'subgenre'),
  ('giallo',               'subgenre'),
  ('haunted house',        'subgenre'),
  ('home invasion',        'subgenre'),
  ('horror comedy',        'subgenre'),
  ('psychological horror', 'subgenre'),
  ('religious horror',     'subgenre'),
  ('slasher',              'subgenre'),
  ('supernatural horror',  'subgenre'),
  ('survival horror',      'subgenre'),
  ('vampires',             'subgenre'),
  ('witchcraft',           'subgenre'),
  ('zombies',              'subgenre');

INSERT INTO tags (name, type) VALUES
  ('occult',               'vibe'),
  ('cult',                 'vibe'),
  ('slow-burn',            'vibe'),
  ('arthouse',             'vibe'),
  ('surreal',              'vibe'),
  ('gore',                 'vibe'),
  ('campy',                'vibe'),
  ('bleak',                'vibe'),
  ('funny',                'vibe'),
  ('violent',              'vibe'),
  ('psychological',        'vibe'),
  ('isolation',            'vibe'),
  ('grief',                'vibe'),
  ('paranoia',             'vibe'),
  ('possession',           'vibe'),
  ('demonic',              'vibe'),
  ('ritual',               'vibe'),
  ('coven',                'vibe'),
  ('female-led',           'vibe'),
  ('period setting',       'vibe'),
  ('small town',           'vibe'),
  ('rural horror',         'vibe'),
  ('urban horror',         'vibe'),
  ('family trauma',        'vibe'),
  ('coming-of-age',        'vibe'),
  ('relationship horror',  'vibe'),
  ('revenge',              'vibe'),
  ('serial killer',        'vibe'),
  ('traps',                'vibe'),
  ('creepy kids',          'vibe'),
  ('creature',             'vibe'),
  ('cursed object',        'vibe'),
  ('cursed place',         'vibe'),
  ('conspiracy',           'vibe'),
  ('splatter',             'vibe'),
  ('midnight movie',       'vibe');
