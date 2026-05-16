-- 0190: DB-backed app rate limits for server-side abuse controls.

CREATE TABLE app_rate_limits (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  window_start DATE NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key, window_start)
);

ALTER TABLE app_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_app_rate_limit(
  p_user_id UUID,
  p_key TEXT,
  p_limit INTEGER,
  p_window_start DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(allowed BOOLEAN, count INTEGER, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_key IS NULL OR p_limit < 1 THEN
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;

  INSERT INTO app_rate_limits (user_id, key, window_start, count)
  VALUES (p_user_id, p_key, p_window_start, 1)
  ON CONFLICT DO NOTHING
  RETURNING app_rate_limits.count INTO new_count;

  IF new_count IS NOT NULL THEN
    RETURN QUERY SELECT true, new_count, GREATEST(p_limit - new_count, 0);
    RETURN;
  END IF;

  UPDATE app_rate_limits
  SET count = app_rate_limits.count + 1,
      updated_at = now()
  WHERE user_id = p_user_id
    AND key = p_key
    AND window_start = p_window_start
    AND app_rate_limits.count < p_limit
  RETURNING app_rate_limits.count INTO new_count;

  IF new_count IS NOT NULL THEN
    RETURN QUERY SELECT true, new_count, GREATEST(p_limit - new_count, 0);
    RETURN;
  END IF;

  SELECT app_rate_limits.count INTO new_count
  FROM app_rate_limits
  WHERE user_id = p_user_id
    AND key = p_key
    AND window_start = p_window_start;

  RETURN QUERY SELECT false, COALESCE(new_count, 0), 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_app_rate_limit(UUID, TEXT, INTEGER, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_app_rate_limit(UUID, TEXT, INTEGER, DATE) TO service_role;
