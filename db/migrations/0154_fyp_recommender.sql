-- 0154_fyp_recommender.sql
--
-- Two columns added in support of sub-project #35 (FYP recommender).
-- Spec: docs/superpowers/specs/2026-05-02-fyp-recommender-design.md

BEGIN;

-- Lanes opt-in: per-user array of tag ids selected as personality lanes.
-- Empty array = no lanes set, no signal contribution to /for-you.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS lane_tag_ids UUID[] NOT NULL DEFAULT '{}';

-- Editorial starter pack flag: ~20 hand-curated films. Used only when a
-- new user has no coven bonds, no lanes set, and no behavior signals.
-- The picks themselves are set via a separate one-shot UPDATE in Task 2.
ALTER TABLE films
  ADD COLUMN IF NOT EXISTS editorial_starter BOOLEAN NOT NULL DEFAULT FALSE;

DROP INDEX IF EXISTS films_editorial_starter_idx;
CREATE INDEX films_editorial_starter_idx ON films(editorial_starter)
  WHERE editorial_starter = TRUE;

COMMIT;
