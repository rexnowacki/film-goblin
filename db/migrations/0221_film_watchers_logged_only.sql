-- "Who's Watched" means a member has logged at least one watched event for
-- the film. Watchlist and library membership are collection intent/ownership,
-- not evidence of a watch.

CREATE OR REPLACE FUNCTION get_coven_watchers_for_film(p_user_id UUID, p_film_id UUID)
RETURNS TABLE (id UUID, username TEXT, avatar_url TEXT)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.username, p.avatar_url
  FROM profiles p
  WHERE (p_user_id = auth.uid() OR auth.role() = 'service_role')
  AND p.id IN (
    SELECT CASE WHEN cm.user_a_id = p_user_id THEN cm.user_b_id ELSE cm.user_a_id END
    FROM coven_members cm
    WHERE cm.user_a_id = p_user_id OR cm.user_b_id = p_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM watched w
    WHERE w.user_id = p.id
      AND w.film_id = p_film_id
  )
  ORDER BY p.username;
$$;

CREATE OR REPLACE FUNCTION get_other_watchers_for_film(p_user_id UUID, p_film_id UUID)
RETURNS TABLE (id UUID, username TEXT, avatar_url TEXT)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.username, p.avatar_url
  FROM profiles p
  WHERE (p_user_id = auth.uid() OR auth.role() = 'service_role')
  AND p.discoverable = true
  AND p.id != p_user_id
  AND p.id NOT IN (
    SELECT CASE WHEN cm.user_a_id = p_user_id THEN cm.user_b_id ELSE cm.user_a_id END
    FROM coven_members cm
    WHERE cm.user_a_id = p_user_id OR cm.user_b_id = p_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM watched w
    WHERE w.user_id = p.id
      AND w.film_id = p_film_id
  )
  ORDER BY p.username;
$$;

REVOKE ALL ON FUNCTION get_coven_watchers_for_film(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_other_watchers_for_film(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_coven_watchers_for_film(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_other_watchers_for_film(UUID, UUID) TO authenticated, service_role;
