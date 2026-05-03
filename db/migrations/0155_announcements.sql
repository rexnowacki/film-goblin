-- 0155: admin-authored one-shot announcements that surface as a full-screen
-- overlay on the next authenticated page load and are dismissed permanently.

CREATE TABLE announcements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  cta_label     TEXT,
  cta_href      TEXT,
  audience      TEXT NOT NULL CHECK (audience IN ('everyone', 'specific')),
  status        TEXT NOT NULL CHECK (status IN ('published', 'archived')) DEFAULT 'published',
  created_by    UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at   TIMESTAMPTZ,
  CONSTRAINT cta_pair CHECK ((cta_label IS NULL) = (cta_href IS NULL)),
  CONSTRAINT cta_internal CHECK (cta_href IS NULL OR cta_href LIKE '/%')
);

CREATE TABLE announcement_recipients (
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE announcement_dismissals (
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  dismissed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, announcement_id)
);

CREATE INDEX idx_announcements_status_created ON announcements (status, created_at);
CREATE INDEX idx_announcement_recipients_user ON announcement_recipients (user_id);
CREATE INDEX idx_announcement_dismissals_user ON announcement_dismissals (user_id);

ALTER TABLE announcements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_recipients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_dismissals    ENABLE ROW LEVEL SECURITY;

-- announcements: anyone authenticated can read; only staff.role='admin' writes.
CREATE POLICY announcements_select_authenticated ON announcements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY announcements_admin_write ON announcements
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'));

-- announcement_recipients: anyone authenticated can read (needed for the
-- pending-for-user query to see recipient rows for "specific" audiences);
-- only admins write.
CREATE POLICY ar_select_authenticated ON announcement_recipients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ar_admin_write ON announcement_recipients
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'));

-- announcement_dismissals: each user reads/writes only their own rows.
CREATE POLICY ad_self_select ON announcement_dismissals
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY ad_self_insert ON announcement_dismissals
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
