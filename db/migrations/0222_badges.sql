-- Achievement badge definitions and immutable member awards.
-- Rules are typed and bounded: admins choose from the evaluator registry below;
-- neither SQL nor free-form JSON is accepted as a condition.

CREATE TYPE badge_condition_kind AS ENUM (
  'watch_log_count',
  'distinct_film_count',
  'director_distinct_film_count'
);

CREATE TABLE badges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL,
  image_url      TEXT NOT NULL,
  condition_kind badge_condition_kind NOT NULL,
  threshold      INTEGER NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT badges_slug_format CHECK (
    char_length(slug) BETWEEN 1 AND 64
    AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT badges_name_length CHECK (
    char_length(btrim(name)) BETWEEN 1 AND 80
    AND name = btrim(name)
  ),
  CONSTRAINT badges_description_length CHECK (
    char_length(btrim(description)) BETWEEN 1 AND 280
    AND description = btrim(description)
  ),
  CONSTRAINT badges_image_url_length CHECK (char_length(image_url) BETWEEN 1 AND 2048),
  CONSTRAINT badges_threshold_range CHECK (threshold BETWEEN 1 AND 10000)
);

CREATE UNIQUE INDEX badges_one_active_condition_threshold_idx
  ON badges (condition_kind, threshold)
  WHERE is_active;

CREATE TABLE user_badges (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id   UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence   JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, badge_id),
  CONSTRAINT user_badges_evidence_object CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE INDEX user_badges_badge_awarded_idx ON user_badges (badge_id, awarded_at DESC);
CREATE INDEX user_badges_user_awarded_idx ON user_badges (user_id, awarded_at DESC);

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY badges_public_read ON badges
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY user_badges_public_read ON user_badges
  FOR SELECT TO anon, authenticated
  USING (true);

-- Public Relics need the definition and earned identity/date. Authorship and
-- evaluator evidence stay server-only even though the rows themselves are public.
REVOKE ALL ON TABLE badges, user_badges FROM anon, authenticated;
GRANT SELECT (
  id, slug, name, description, image_url, condition_kind, threshold,
  is_active, created_at, updated_at
) ON badges TO anon, authenticated;
GRANT SELECT (user_id, badge_id, awarded_at) ON user_badges TO anon, authenticated;
GRANT ALL ON TABLE badges, user_badges TO service_role;

INSERT INTO badges (slug, name, description, image_url, condition_kind, threshold)
VALUES
  (
    'fresh-blood',
    'Fresh Blood',
    'Logged 25 watches in the diary.',
    '/badges/fresh-blood.svg',
    'watch_log_count',
    25
  ),
  (
    'deep-cut',
    'Deep Cut',
    'Logged 50 watches in the diary.',
    '/badges/deep-cut.svg',
    'watch_log_count',
    50
  ),
  (
    'midnight-glutton',
    'Midnight Glutton',
    'Logged 75 watches in the diary.',
    '/badges/midnight-glutton.svg',
    'watch_log_count',
    75
  ),
  (
    'century-beast',
    'Century Beast',
    'Logged 100 watches in the diary.',
    '/badges/century-beast.svg',
    'watch_log_count',
    100
  ),
  (
    'auteurs-familiar',
    'Auteur''s Familiar',
    'Logged three distinct films from a single director.',
    '/badges/auteurs-familiar.svg',
    'director_distinct_film_count',
    3
  );
