-- Remove LIMIT 4 from get_coven_watchers_for_film so the "Also Watching"
-- sheet can list all coven watchers. The 4-chip cap is now applied in JS.
CREATE OR REPLACE FUNCTION get_coven_watchers_for_film(p_user_id UUID, p_film_id UUID)
RETURNS TABLE (id UUID, username TEXT, avatar_url TEXT)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.username, p.avatar_url
  FROM profiles p
  WHERE p.id IN (
    SELECT CASE WHEN cm.user_a_id = p_user_id THEN cm.user_b_id ELSE cm.user_a_id END
    FROM coven_members cm
    WHERE cm.user_a_id = p_user_id OR cm.user_b_id = p_user_id
  )
  AND (
    EXISTS (SELECT 1 FROM watchlists w WHERE w.user_id = p.id AND w.film_id = p_film_id)
    OR EXISTS (SELECT 1 FROM library l WHERE l.user_id = p.id AND l.film_id = p_film_id)
  )
  ORDER BY p.username;
$$;
