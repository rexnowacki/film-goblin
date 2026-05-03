-- 0156: per-announcement color theme. Admin picks panel + title + body + CTA
-- colors when authoring. Defaults reproduce the popup style shipped in 0155
-- (plum panel, bone text, pink CTA).

ALTER TABLE announcements
  ADD COLUMN panel_color TEXT NOT NULL DEFAULT 'plum'
    CHECK (panel_color IN ('pink', 'plum', 'seafoam', 'bone')),
  ADD COLUMN title_color TEXT NOT NULL DEFAULT 'bone'
    CHECK (title_color IN ('pink', 'plum', 'seafoam', 'bone', 'void')),
  ADD COLUMN body_color TEXT NOT NULL DEFAULT 'bone'
    CHECK (body_color IN ('pink', 'plum', 'seafoam', 'bone', 'void')),
  ADD COLUMN cta_color TEXT NOT NULL DEFAULT 'pink'
    CHECK (cta_color IN ('pink', 'plum', 'seafoam', 'bone'));
