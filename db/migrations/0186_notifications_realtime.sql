-- 0186: publish notification inserts so the top-nav bell updates immediately
-- when triggers create rows, including ritual @mention notifications.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
