import type pg from "pg";

// Find users with at least one watched film that has no verdict on ANY of
// their watches for that film, where the watch is older than 7 days, who
// have NOT received a rate_reminder in the past 7 days, and who haven't
// opted out. A film is considered rated if ANY watched row for that
// (user, film) has recommended IS NOT NULL.
const RATE_REMINDERS_QUERY = `
WITH eligible AS (
  SELECT
    p.id AS user_id,
    (
      SELECT w2.id
        FROM watched w2
       WHERE w2.user_id = p.id
         AND w2.recommended IS NULL
         AND w2.created_at < now() - INTERVAL '7 days'
         AND NOT EXISTS (
           SELECT 1 FROM watched wv
            WHERE wv.user_id = p.id
              AND wv.film_id = w2.film_id
              AND wv.recommended IS NOT NULL
         )
       ORDER BY w2.created_at ASC
       LIMIT 1
    ) AS oldest_watched_id,
    (
      SELECT w2.film_id
        FROM watched w2
       WHERE w2.user_id = p.id
         AND w2.recommended IS NULL
         AND w2.created_at < now() - INTERVAL '7 days'
         AND NOT EXISTS (
           SELECT 1 FROM watched wv
            WHERE wv.user_id = p.id
              AND wv.film_id = w2.film_id
              AND wv.recommended IS NOT NULL
         )
       ORDER BY w2.created_at ASC
       LIMIT 1
    ) AS oldest_film_id,
    (
      SELECT count(DISTINCT w3.film_id)::int
        FROM watched w3
       WHERE w3.user_id = p.id
         AND w3.created_at < now() - INTERVAL '7 days'
         AND NOT EXISTS (
           SELECT 1 FROM watched wv
            WHERE wv.user_id = p.id
              AND wv.film_id = w3.film_id
              AND wv.recommended IS NOT NULL
         )
    ) AS unrated_count
    FROM profiles p
   WHERE p.notify_rate_reminders = TRUE
     AND EXISTS (
       SELECT 1 FROM watched w
        WHERE w.user_id = p.id
          AND w.recommended IS NULL
          AND w.created_at < now() - INTERVAL '7 days'
          AND NOT EXISTS (
            SELECT 1 FROM watched wv
             WHERE wv.user_id = p.id
               AND wv.film_id = w.film_id
               AND wv.recommended IS NOT NULL
          )
     )
     AND NOT EXISTS (
       SELECT 1 FROM notifications n
        WHERE n.user_id = p.id
          AND n.kind = 'rate_reminder'
          AND n.created_at > now() - INTERVAL '7 days'
     )
)
INSERT INTO notifications (user_id, kind, actor_user_id, payload)
SELECT
  e.user_id,
  'rate_reminder',
  NULL,
  jsonb_build_object(
    'watched_id',    e.oldest_watched_id,
    'film_id',       e.oldest_film_id,
    'unrated_count', e.unrated_count
  )
FROM eligible e
RETURNING id
`;

export async function runRateReminders(client: pg.Client): Promise<{ inserted: number }> {
  const result = await client.query(RATE_REMINDERS_QUERY);
  return { inserted: result.rowCount ?? 0 };
}
