-- 0204: IP/subject-keyed rate limits for pre-auth abuse controls.
--
-- window_start is a caller-chosen UTC text bucket so one table serves multiple
-- granularities: "2026-06-09T14:15" (15-minute) or "2026-06-09T14" (hourly).
-- Text buckets compare lexicographically, so cleanup can prune with
-- `window_start < 'YYYY-MM-DD'`.
--
-- ip_hash is a generic subject hash, sha256-truncated. IP buckets pass
-- sha256(client ip); the signin-global bucket passes 'id:' || sha256(identifier)
-- to cap distributed attacks on one account.

CREATE TABLE app_ip_rate_limits (
  ip_hash      TEXT NOT NULL,
  key          TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_hash, key, window_start)
);

ALTER TABLE app_ip_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_ip_rate_limit(
  p_ip_hash TEXT,
  p_key TEXT,
  p_limit INTEGER,
  p_window_start TEXT
)
RETURNS TABLE(allowed BOOLEAN, count INTEGER, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  IF p_ip_hash IS NULL OR p_key IS NULL OR p_window_start IS NULL OR p_limit < 1 THEN
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;

  INSERT INTO app_ip_rate_limits (ip_hash, key, window_start, count)
  VALUES (p_ip_hash, p_key, p_window_start, 1)
  ON CONFLICT DO NOTHING
  RETURNING app_ip_rate_limits.count INTO new_count;

  IF new_count IS NOT NULL THEN
    RETURN QUERY SELECT true, new_count, GREATEST(p_limit - new_count, 0);
    RETURN;
  END IF;

  UPDATE app_ip_rate_limits
  SET count = app_ip_rate_limits.count + 1,
      updated_at = now()
  WHERE ip_hash = p_ip_hash
    AND key = p_key
    AND window_start = p_window_start
    AND app_ip_rate_limits.count < p_limit
  RETURNING app_ip_rate_limits.count INTO new_count;

  IF new_count IS NOT NULL THEN
    RETURN QUERY SELECT true, new_count, GREATEST(p_limit - new_count, 0);
    RETURN;
  END IF;

  SELECT app_ip_rate_limits.count INTO new_count
  FROM app_ip_rate_limits
  WHERE ip_hash = p_ip_hash
    AND key = p_key
    AND window_start = p_window_start;

  RETURN QUERY SELECT false, COALESCE(new_count, 0), 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ip_rate_limit(TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ip_rate_limit(TEXT, TEXT, INTEGER, TEXT) TO service_role;
