-- 0164: Local Haunts theater/showing/match tables.

CREATE TABLE theaters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  base_url TEXT NOT NULL,
  coming_soon_url TEXT NOT NULL,
  street_address TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  timezone TEXT NOT NULL DEFAULT 'America/Phoenix',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE theater_showings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theater_id UUID NOT NULL REFERENCES theaters(id) ON DELETE CASCADE,

  source_url TEXT NOT NULL,
  source_id TEXT,
  source_hash TEXT NOT NULL,

  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,

  starts_at TIMESTAMPTZ,
  starts_on DATE,
  date_precision TEXT NOT NULL DEFAULT 'label'
    CHECK (date_precision IN ('datetime','date','label','unknown')),
  date_label TEXT,

  runtime_label TEXT,
  rating_label TEXT,
  category_labels TEXT[] NOT NULL DEFAULT '{}',

  poster_url TEXT,
  description TEXT,
  showtime_label TEXT,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (theater_id, source_hash)
);

CREATE TABLE theater_showing_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  showing_id UUID NOT NULL REFERENCES theater_showings(id) ON DELETE CASCADE,
  film_id UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,

  match_type TEXT NOT NULL CHECK (
    match_type IN (
      'exact_title',
      'normalized_title',
      'title_year',
      'fuzzy_title',
      'manual_admin'
    )
  ),
  confidence NUMERIC NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'needs_review' CHECK (
    status IN ('auto','needs_review','confirmed','rejected','ignored')
  ),

  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (showing_id, film_id)
);

CREATE INDEX theater_showings_theater_active_idx
  ON theater_showings (theater_id, is_active, last_seen_at DESC);

CREATE INDEX theater_showings_normalized_title_idx
  ON theater_showings (normalized_title);

CREATE INDEX theater_showing_matches_showing_idx
  ON theater_showing_matches (showing_id);

CREATE INDEX theater_showing_matches_film_status_idx
  ON theater_showing_matches (film_id, status);

ALTER TABLE theaters ENABLE ROW LEVEL SECURITY;
ALTER TABLE theater_showings ENABLE ROW LEVEL SECURITY;
ALTER TABLE theater_showing_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY theaters_read_active ON theaters
  FOR SELECT TO authenticated
  USING (is_active = TRUE);

CREATE POLICY theater_showings_read_active ON theater_showings
  FOR SELECT TO authenticated
  USING (is_active = TRUE);

CREATE POLICY theater_showing_matches_read_active ON theater_showing_matches
  FOR SELECT TO authenticated
  USING (
    status IN ('auto','confirmed','needs_review')
    AND EXISTS (
      SELECT 1
      FROM theater_showings ts
      WHERE ts.id = theater_showing_matches.showing_id
        AND ts.is_active = TRUE
    )
  );

GRANT SELECT ON theaters TO authenticated;
GRANT SELECT ON theater_showings TO authenticated;
GRANT SELECT ON theater_showing_matches TO authenticated;

INSERT INTO theaters (
  name,
  slug,
  base_url,
  coming_soon_url,
  street_address,
  city,
  region,
  postal_code,
  country,
  latitude,
  longitude,
  timezone
)
VALUES
(
  'The Loft Cinema',
  'loft-cinema',
  'https://loftcinema.org',
  'https://loftcinema.org/coming-soon/',
  '3233 E Speedway Blvd',
  'Tucson',
  'AZ',
  '85716',
  'US',
  32.2368,
  -110.9229,
  'America/Phoenix'
),
(
  'Guild Cinema',
  'guild-cinema',
  'https://www.guildcinema.com',
  'https://www.guildcinema.com/comingsoon',
  '3405 Central Avenue NE',
  'Albuquerque',
  'NM',
  '87106',
  'US',
  35.0805,
  -106.6055,
  'America/Denver'
)
ON CONFLICT (slug) DO NOTHING;
