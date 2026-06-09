-- 0205: DB-level input constraints.
--
-- Server actions validate username format and text lengths, but any user's JWT
-- works directly against PostgREST and skips all of it. RLS makes the DB the
-- boundary for ownership; these CHECKs make it the boundary for shape.

UPDATE profiles SET username = lower(username) WHERE username <> lower(username);

ALTER TABLE profiles
  ADD CONSTRAINT profiles_username_format CHECK (
    username ~ '^[a-z0-9._]{1,24}$'
    AND username ~ '[a-z0-9]'
    AND username !~ '^\.'
    AND username !~ '\.$'
  ),
  ADD CONSTRAINT profiles_display_name_len CHECK (char_length(display_name) <= 50),
  ADD CONSTRAINT profiles_bio_len          CHECK (char_length(bio) <= 500),
  ADD CONSTRAINT profiles_avatar_url_len   CHECK (char_length(avatar_url) <= 1000);

ALTER TABLE watched
  ADD CONSTRAINT watched_note_len CHECK (note IS NULL OR char_length(note) <= 500);
