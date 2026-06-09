-- 0203: column-level privileges on profiles.
--
-- The profiles_read RLS policy (0101) is intentionally USING (true) so member
-- identity renders on public pages. But that exposed every column to the anon
-- key, including unsubscribe_token, email prefs, and must_change_password.
-- RLS controls rows; these grants control columns.
--
-- PostgREST `select=*` on profiles now fails for client roles because SELECT *
-- requires privilege on every column. App code must use explicit column lists.

REVOKE ALL ON TABLE profiles FROM anon, authenticated;

GRANT SELECT (id, username, display_name, avatar_url, bio, role, created_at)
  ON profiles TO anon;

GRANT SELECT (id, username, display_name, bio, avatar_url, broadcast_watchlist_adds,
  created_at, updated_at, broadcast_library, broadcast_watched, onboarded_at,
  email_added_at, email_price_drops, email_coven_recs, email_comments,
  email_coven_invites, role, notify_rate_reminders, notify_comment_likes,
  lane_tag_ids, discoverable, is_starter, starter_order, notify_film_requests,
  must_change_password)
  ON profiles TO authenticated;

GRANT UPDATE (username, display_name, bio, avatar_url, broadcast_watchlist_adds,
  broadcast_library, broadcast_watched, email_price_drops, email_coven_recs,
  email_comments, email_coven_invites, notify_rate_reminders, notify_comment_likes,
  notify_film_requests, discoverable, lane_tag_ids, onboarded_at, unsubscribe_token)
  ON profiles TO authenticated;
