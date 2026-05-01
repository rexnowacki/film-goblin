-- 0143: backfill `recommended` into existing watch_logged activity payloads.
--
-- 0142 updated the trigger to write recommended at INSERT time, but pre-0142
-- activity rows have no `recommended` key — so feeds render no verdict pill
-- for them even when the underlying watched row carries a rating.
--
-- This backfill joins activity → watched on (actor_user_id = user_id) and
-- (payload->>'film_id' = film_id), within a ±5s window on created_at (the
-- trigger fires synchronously on watched INSERT, so the two timestamps are
-- within milliseconds). Only touches rows where the user actually rated
-- (watched.recommended IS NOT NULL) and the activity payload doesn't already
-- have the key.
--
-- Edge case: a user logged the same film twice within seconds with different
-- ratings — the join could pick the wrong watched row. Vanishingly rare on
-- our dataset; acceptable.

UPDATE activity a
   SET payload = a.payload || jsonb_build_object('recommended', w.recommended)
  FROM watched w
 WHERE a.kind = 'watch_logged'
   AND a.actor_user_id = w.user_id
   AND (a.payload->>'film_id')::uuid = w.film_id
   AND w.recommended IS NOT NULL
   AND a.payload->>'recommended' IS NULL
   AND a.created_at BETWEEN w.created_at - interval '5 seconds'
                        AND w.created_at + interval '5 seconds';
