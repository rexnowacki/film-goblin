-- 0130_comment_notification_kind.sql
-- Extends the notification_kind enum with 'comment_on_activity'. The trigger
-- function that references this value lives in 0131; Postgres requires the
-- ALTER TYPE to commit in its own transaction before a SECURITY DEFINER
-- function can reference the new value. See 0123/0124 for the same split.

ALTER TYPE notification_kind ADD VALUE 'comment_on_activity';
