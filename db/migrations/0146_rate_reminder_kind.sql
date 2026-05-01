-- 0146: rate-reminder notification.
--
-- A nudge for users who logged a watch but skipped the verdict pill (or
-- had it skipped automatically pre-0141). Drives coven-rating density —
-- more films past the ≥5 sample threshold means more films get a
-- coven_rating_pct on /film/[id].
--
-- Unlike the four trigger-driven notification kinds (coven invites,
-- recommendations, comments, price drops), rate_reminder is generated
-- by a daily cron, NOT a trigger. The cron lives at
-- /api/cron/send-rate-reminders and dedupes on existing reminders
-- inside the past 7 days. No SECURITY DEFINER function references the
-- new enum value, so the ALTER TYPE can ship in the same migration as
-- the column ADD without the split that 0123/0124 + 0130/0131 needed.
--
-- profiles.notify_rate_reminders is the in-app opt-out. Defaults TRUE
-- since the reminder is opt-in by virtue of the user having unrated
-- watches at all — they're already engaged.

ALTER TYPE notification_kind ADD VALUE 'rate_reminder';

ALTER TABLE profiles
  ADD COLUMN notify_rate_reminders BOOLEAN NOT NULL DEFAULT TRUE;
