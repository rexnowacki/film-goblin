-- 0197: Individual Loft showtimes + shared-gazing invites.

CREATE TABLE theater_showtimes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theater_id UUID NOT NULL REFERENCES theaters(id) ON DELETE CASCADE,
  film_id UUID REFERENCES films(id) ON DELETE SET NULL,

  source_sid TEXT NOT NULL,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,

  starts_at TIMESTAMPTZ NOT NULL,
  screen_label TEXT,
  format_label TEXT,

  tickets_url TEXT NOT NULL,
  source_url TEXT NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (theater_id, source_sid)
);

CREATE INDEX theater_showtimes_film_active_idx
  ON theater_showtimes (film_id, is_active, starts_at);

CREATE INDEX theater_showtimes_theater_active_idx
  ON theater_showtimes (theater_id, is_active, starts_at);

CREATE TABLE gazing_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  showtime_id UUID REFERENCES theater_showtimes(id) ON DELETE SET NULL,
  film_id UUID REFERENCES films(id) ON DELETE SET NULL,

  -- Snapshot fields: frozen at creation so the page/OG render correctly
  -- after the weekly refresh inactivates the underlying slot.
  film_title TEXT NOT NULL,
  poster_url TEXT,
  theater_name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  format_label TEXT,
  tickets_url TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX gazing_invites_created_by_idx ON gazing_invites (created_by);
CREATE INDEX gazing_invites_token_idx ON gazing_invites (token);

ALTER TABLE theater_showtimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gazing_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY theater_showtimes_read_active ON theater_showtimes
  FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY theaters_read_active_anon ON theaters
  FOR SELECT TO anon
  USING (is_active = TRUE);

CREATE POLICY gazing_invites_owner_read ON gazing_invites
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY gazing_invites_owner_insert ON gazing_invites
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

GRANT SELECT ON theaters TO anon;
GRANT SELECT ON theater_showtimes TO anon, authenticated;
GRANT SELECT, INSERT ON gazing_invites TO authenticated;
