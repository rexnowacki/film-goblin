-- 0142: include `recommended` in the watch_logged activity payload so the
-- feed can surface the verdict pill ("loved it" / "didn't love it") next
-- to broadcast watches.
--
-- Snapshotted at INSERT, same as `note` (per 0132). Edits to
-- watched.recommended after the fact do NOT propagate — same staleness
-- gap flagged for note. If/when we ship the AFTER UPDATE trigger that
-- syncs note, extend it to cover recommended too.
--
-- Backwards-compat: existing rows have payload->>'recommended' = NULL
-- (key absent). The feed treats NULL as "no rating" and renders no pill,
-- which is the right behavior for both pre-0141 watches and post-0141
-- watches the user skipped the rating on.

CREATE OR REPLACE FUNCTION public.activity_on_watch_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  broadcast BOOLEAN;
BEGIN
  SELECT broadcast_watched INTO broadcast FROM public.profiles WHERE id = NEW.user_id;
  IF broadcast IS TRUE THEN
    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (
      NEW.user_id,
      'watch_logged',
      jsonb_build_object(
        'film_id',     NEW.film_id,
        'note',        NEW.note,
        'recommended', NEW.recommended
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
