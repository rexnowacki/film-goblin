-- List creation is currently an admin-only action; broadcasting "curated a new
-- grimoire" to the feed is noise. Drop the trigger and purge existing rows.
-- The enum value `list_created` is intentionally retained so the trigger can
-- be reintroduced later if user-curated lists go live.

DROP TRIGGER IF EXISTS on_list_insert ON lists;
DROP FUNCTION IF EXISTS public.activity_on_list_insert();

DELETE FROM public.activity WHERE kind = 'list_created';
