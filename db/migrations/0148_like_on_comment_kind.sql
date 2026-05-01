-- 0148: like_on_comment notification kind + per-recipient in-app opt-out.
--
-- Mirrors the rate_reminder mig (0146): enum ADD VALUE + new profiles column
-- in one migration. The trigger function in 0149 references the new enum
-- value, so 0148 must commit first (PostgreSQL won't let a function in the
-- same transaction reference an enum value introduced in that transaction).
--
-- notify_comment_likes defaults TRUE so existing users get notifications by
-- default. Recipient can opt out from /settings; the trigger filters on this
-- column and skips the INSERT entirely (no row, not a hidden row).

ALTER TYPE notification_kind ADD VALUE 'like_on_comment';

ALTER TABLE profiles
  ADD COLUMN notify_comment_likes BOOLEAN NOT NULL DEFAULT TRUE;
