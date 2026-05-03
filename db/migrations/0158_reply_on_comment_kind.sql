-- 0158_reply_on_comment_kind.sql
-- Extends notification_kind enum. Must be committed in its own
-- transaction before 0159 (which references the new value).
ALTER TYPE notification_kind ADD VALUE 'reply_on_comment';
