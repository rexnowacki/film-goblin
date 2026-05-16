-- 0189: Lock down internal invite/cron tables and SECURITY DEFINER RPCs.
--
-- These tables are only accessed through server-side service-role clients and
-- trigger/RPC internals. Enable RLS with no client policies so anon/auth roles
-- cannot read or mutate them directly.

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_locks ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER functions get EXECUTE for PUBLIC by default. These helpers
-- are intended for service-role server code only, not direct browser RPC calls.
REVOKE ALL ON FUNCTION public.create_invite_code_for_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.burn_invite_code(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.acquire_cron_lock(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.burn_invite_code(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.acquire_cron_lock(TEXT, TIMESTAMPTZ) TO service_role;
