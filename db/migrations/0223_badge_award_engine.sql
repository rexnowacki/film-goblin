-- Locked, earned-once badge evaluator.
-- The advisory lock is not merely a duplicate guard: it prevents concurrent
-- watch inserts from both observing a below-threshold snapshot and missing an
-- award. ON CONFLICT is the independent idempotency defense.

CREATE OR REPLACE FUNCTION badges_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER badges_touch_updated_at
BEFORE UPDATE ON badges
FOR EACH ROW EXECUTE FUNCTION badges_set_updated_at();

CREATE OR REPLACE FUNCTION evaluate_badges_for_user(
  p_user_id UUID,
  p_badge_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_badge RECORD;
  v_observed BIGINT;
  v_director_normalized TEXT;
  v_director_display TEXT;
  v_evidence JSONB;
  v_inserted INTEGER;
  v_total INTEGER := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- One transaction-wide source lock serializes every award evaluation. Film
  -- Goblin's current write volume makes this short global critical section a
  -- better trade than per-user locks: it closes watch-vs-definition/director
  -- snapshot races and cannot deadlock when a future import writes several
  -- users in different orders inside one transaction.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('film-goblin:badge-award-sources', 2243)
  );

  FOR v_badge IN
    SELECT b.id, b.condition_kind, b.threshold
    FROM public.badges b
    WHERE b.is_active
      AND (p_badge_id IS NULL OR b.id = p_badge_id)
    ORDER BY b.id
  LOOP
    v_observed := 0;
    v_director_normalized := NULL;
    v_director_display := NULL;

    CASE v_badge.condition_kind
      WHEN 'watch_log_count' THEN
        SELECT count(*)::BIGINT
        INTO v_observed
        FROM public.watched w
        WHERE w.user_id = p_user_id;

      WHEN 'distinct_film_count' THEN
        SELECT count(DISTINCT w.film_id)::BIGINT
        INTO v_observed
        FROM public.watched w
        WHERE w.user_id = p_user_id;

      WHEN 'director_distinct_film_count' THEN
        SELECT candidate.normalized_director,
               candidate.display_director,
               candidate.observed_count
        INTO v_director_normalized, v_director_display, v_observed
        FROM (
          SELECT
            lower(btrim(regexp_replace(f.director, '[[:space:]]+', ' ', 'g'))) AS normalized_director,
            min(btrim(regexp_replace(f.director, '[[:space:]]+', ' ', 'g'))) AS display_director,
            count(DISTINCT w.film_id)::BIGINT AS observed_count
          FROM public.watched w
          JOIN public.films f ON f.id = w.film_id
          WHERE w.user_id = p_user_id
            AND btrim(regexp_replace(f.director, '[[:space:]]+', ' ', 'g')) <> ''
          GROUP BY lower(btrim(regexp_replace(f.director, '[[:space:]]+', ' ', 'g')))
        ) AS candidate
        ORDER BY candidate.observed_count DESC, candidate.normalized_director
        LIMIT 1;
    END CASE;

    v_observed := COALESCE(v_observed, 0);
    IF v_observed < v_badge.threshold THEN
      CONTINUE;
    END IF;

    v_evidence := jsonb_build_object(
      'condition_kind', v_badge.condition_kind::TEXT,
      'threshold', v_badge.threshold,
      'observed_count', v_observed
    );
    IF v_badge.condition_kind = 'director_distinct_film_count' THEN
      v_evidence := v_evidence || jsonb_build_object(
        'normalized_director', v_director_normalized,
        'display_director', v_director_display
      );
    END IF;

    INSERT INTO public.user_badges (user_id, badge_id, evidence)
    VALUES (p_user_id, v_badge.id, v_evidence)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_total := v_total + v_inserted;
  END LOOP;

  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION evaluate_badges_for_all_users(
  p_badge_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_total INTEGER := 0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('film-goblin:badge-award-sources', 2243)
  );

  FOR v_user_id IN
    SELECT DISTINCT w.user_id
    FROM public.watched w
    ORDER BY w.user_id
  LOOP
    v_total := v_total + public.evaluate_badges_for_user(v_user_id, p_badge_id);
  END LOOP;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION evaluate_badges_for_user(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION evaluate_badges_for_all_users(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION evaluate_badges_for_user(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION evaluate_badges_for_all_users(UUID) TO service_role;

CREATE OR REPLACE FUNCTION award_badges_after_watched_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.evaluate_badges_for_user(NEW.user_id, NULL);
  RETURN NEW;
END;
$$;

CREATE TRIGGER watched_award_badges
AFTER INSERT OR UPDATE OF user_id, film_id ON watched
FOR EACH ROW EXECUTE FUNCTION award_badges_after_watched_change();

CREATE OR REPLACE FUNCTION backfill_badge_after_definition_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_active THEN
    PERFORM public.evaluate_badges_for_all_users(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER badges_backfill_definition
AFTER INSERT OR UPDATE OF condition_kind, threshold, is_active ON badges
FOR EACH ROW EXECUTE FUNCTION backfill_badge_after_definition_change();

CREATE OR REPLACE FUNCTION reevaluate_badges_after_director_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_old_normalized TEXT;
  v_new_normalized TEXT;
BEGIN
  v_old_normalized := lower(btrim(regexp_replace(OLD.director, '[[:space:]]+', ' ', 'g')));
  v_new_normalized := lower(btrim(regexp_replace(NEW.director, '[[:space:]]+', ' ', 'g')));
  IF v_old_normalized IS NOT DISTINCT FROM v_new_normalized THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('film-goblin:badge-award-sources', 2243)
  );

  FOR v_user_id IN
    SELECT DISTINCT w.user_id
    FROM public.watched w
    WHERE w.film_id = NEW.id
    ORDER BY w.user_id
  LOOP
    PERFORM public.evaluate_badges_for_user(v_user_id, NULL);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER films_director_reevaluate_badges
AFTER UPDATE OF director ON films
FOR EACH ROW EXECUTE FUNCTION reevaluate_badges_after_director_change();

REVOKE ALL ON FUNCTION award_badges_after_watched_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION backfill_badge_after_definition_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reevaluate_badges_after_director_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION badges_set_updated_at() FROM PUBLIC, anon, authenticated;

-- Seed definitions predate the definition trigger, so backfill them once after
-- every evaluator and trigger is in place.
SELECT public.evaluate_badges_for_all_users(NULL);
