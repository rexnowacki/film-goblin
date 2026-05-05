-- 0163: Local Haunts in-app notification kind.
-- Keep enum changes isolated from table/trigger migrations so Postgres can
-- commit the new value before later migrations insert rows using it.

ALTER TYPE notification_kind ADD VALUE 'theater_showing_match';
