-- 0152_tagging_system_v2.sql
--
-- Replaces sub-project #32's two-facet tag system with the v2 seven-facet
-- positional system. Spec: docs/superpowers/specs/2026-05-02-tagging-system-v2-design.md
--
-- Wipe is intentional and confirmed during brainstorm — sub-project #32's
-- film_tags rows were proto curation only, no users tagged at scale.

BEGIN;

-- 1. Wipe.
TRUNCATE TABLE film_tags CASCADE;
TRUNCATE TABLE tags CASCADE;

-- 2. Expand facet vocabulary.
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_type_check;
ALTER TABLE tags ADD CONSTRAINT tags_type_check
  CHECK (type IN ('subgenre','subject','tone','theme','setting','content'));

-- 3. Position + Primary flag on film_tags.
ALTER TABLE film_tags
  ADD COLUMN IF NOT EXISTS position SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Hard guarantee: at most one Primary per film.
DROP INDEX IF EXISTS film_tags_one_primary_per_film;
CREATE UNIQUE INDEX film_tags_one_primary_per_film
  ON film_tags(film_id) WHERE is_primary = TRUE;

-- 5. Read by film + ordered by position cheaply.
DROP INDEX IF EXISTS film_tags_film_position_idx;
CREATE INDEX film_tags_film_position_idx ON film_tags(film_id, position);

-- 6. horror_adjacent on films, set by setFilmTags when Primary is 'thriller'.
ALTER TABLE films
  ADD COLUMN IF NOT EXISTS horror_adjacent BOOLEAN NOT NULL DEFAULT FALSE;

DROP INDEX IF EXISTS films_horror_adjacent_idx;
CREATE INDEX films_horror_adjacent_idx ON films(horror_adjacent)
  WHERE horror_adjacent = TRUE;

-- 7. Seed: 88 canonical tags.
INSERT INTO tags (name, type) VALUES
  -- 24 sub-genres
  ('body horror','subgenre'), ('cosmic horror','subgenre'),
  ('creature feature','subgenre'), ('cursed media','subgenre'),
  ('eco-horror','subgenre'), ('erotic horror','subgenre'),
  ('exploitation','subgenre'), ('extreme horror','subgenre'),
  ('folk horror','subgenre'), ('found footage','subgenre'),
  ('giallo','subgenre'), ('gothic','subgenre'),
  ('haunted house','subgenre'), ('home invasion','subgenre'),
  ('horror comedy','subgenre'), ('monster movie','subgenre'),
  ('psychological horror','subgenre'), ('religious horror','subgenre'),
  ('slasher','subgenre'), ('splatterpunk','subgenre'),
  ('supernatural horror','subgenre'), ('survival horror','subgenre'),
  ('techno-horror','subgenre'), ('thriller','subgenre'),
  -- 17 subjects
  ('vampires','subject'), ('zombies','subject'), ('witches','subject'),
  ('werewolves','subject'), ('ghosts','subject'), ('demons','subject'),
  ('aliens','subject'), ('kaiju','subject'), ('serial killer','subject'),
  ('cult','subject'), ('coven','subject'), ('creepy kids','subject'),
  ('cursed object','subject'), ('cursed place','subject'),
  ('possession','subject'), ('ritual','subject'), ('traps','subject'),
  -- 16 tones
  ('arthouse','tone'), ('atmospheric','tone'), ('bleak','tone'),
  ('campy','tone'), ('claustrophobic','tone'), ('dreamlike','tone'),
  ('fever dream','tone'), ('funny','tone'), ('hangout','tone'),
  ('mean-spirited','tone'), ('midnight movie','tone'), ('nihilistic','tone'),
  ('nostalgic','tone'), ('psychedelic','tone'), ('slow-burn','tone'),
  ('surreal','tone'),
  -- 21 themes (incl. breakup horror, the v2 add)
  ('addiction','theme'), ('body autonomy','theme'), ('breakup horror','theme'),
  ('class','theme'), ('colonialism','theme'), ('coming-of-age','theme'),
  ('conspiracy','theme'), ('family trauma','theme'), ('grief','theme'),
  ('isolation','theme'), ('masculinity','theme'), ('motherhood','theme'),
  ('obsession','theme'), ('paranoia','theme'), ('queer','theme'),
  ('race','theme'), ('relationship horror','theme'), ('religion','theme'),
  ('revenge','theme'), ('sexuality','theme'), ('technology','theme'),
  -- 6 settings
  ('period setting','setting'), ('rural horror','setting'),
  ('small town','setting'), ('suburban','setting'),
  ('urban horror','setting'), ('wilderness','setting'),
  -- 4 content
  ('gore','content'), ('splatter','content'),
  ('sexual content','content'), ('violent','content');

COMMIT;
