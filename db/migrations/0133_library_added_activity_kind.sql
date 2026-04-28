-- 0133_library_added_activity_kind.sql
-- Extends the activity_kind enum with 'library_added' so library inserts can
-- be fanned into the activity feed. The trigger function lives in 0134;
-- Postgres requires the ALTER TYPE to commit in its own transaction before a
-- function can reference the new value. See 0123/0124 and 0130/0131 for the
-- same split.

ALTER TYPE activity_kind ADD VALUE 'library_added';
