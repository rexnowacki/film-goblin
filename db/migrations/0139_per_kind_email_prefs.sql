-- 0139: split email_notifications_enabled into a per-kind matrix.
--
-- Previously a single boolean gated all email sends (currently only the
-- price-drop digest fires). This migration adds four per-kind columns so
-- users can opt into specific email types without throwing the master
-- switch.
--
-- Backfill: email_price_drops mirrors email_notifications_enabled so
-- users who'd previously turned off email stay opted out of price drops.
-- The other three kinds default TRUE (they weren't emailing before, so
-- there's no semantic loss either way).
--
-- email_notifications_enabled stays in the schema for backwards compat
-- with the unsubscribe route (which keeps writing it FALSE alongside the
-- per-kind columns) and for any in-flight reads. A later cleanup PR can
-- drop it after a soak window.

ALTER TABLE profiles
  ADD COLUMN email_price_drops    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN email_coven_recs     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN email_comments       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN email_coven_invites  BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE profiles SET email_price_drops = email_notifications_enabled;
