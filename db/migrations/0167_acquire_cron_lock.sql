-- 0167: Race-safe cron lock acquisition helper.

CREATE OR REPLACE FUNCTION public.acquire_cron_lock(
  p_key TEXT,
  p_locked_until TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO cron_locks (key, locked_until, updated_at)
  VALUES (p_key, p_locked_until, now())
  ON CONFLICT (key) DO UPDATE
    SET locked_until = EXCLUDED.locked_until,
        updated_at = now()
    WHERE cron_locks.locked_until <= now()
  RETURNING TRUE;
$$;
