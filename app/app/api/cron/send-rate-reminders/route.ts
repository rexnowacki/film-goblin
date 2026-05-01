import { NextResponse } from "next/server";
import pg from "pg";
import * as Sentry from "@sentry/node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function missing(envVar: string) {
  return NextResponse.json({ error: `${envVar} not configured` }, { status: 500 });
}

// Find users with at least one watched row whose recommended is NULL and
// whose created_at is older than 7 days, who have NOT received a
// rate_reminder notification in the past 7 days, and who haven't opted
// out via profiles.notify_rate_reminders. Insert one notification per
// eligible user, anchored to the OLDEST unrated watch (deep-link target).
const QUERY = `
WITH eligible AS (
  SELECT
    p.id AS user_id,
    (
      SELECT w2.id
        FROM watched w2
       WHERE w2.user_id = p.id
         AND w2.recommended IS NULL
         AND w2.created_at < now() - INTERVAL '7 days'
       ORDER BY w2.created_at ASC
       LIMIT 1
    ) AS oldest_watched_id,
    (
      SELECT w2.film_id
        FROM watched w2
       WHERE w2.user_id = p.id
         AND w2.recommended IS NULL
         AND w2.created_at < now() - INTERVAL '7 days'
       ORDER BY w2.created_at ASC
       LIMIT 1
    ) AS oldest_film_id,
    (
      SELECT count(*)::int
        FROM watched w3
       WHERE w3.user_id = p.id
         AND w3.recommended IS NULL
         AND w3.created_at < now() - INTERVAL '7 days'
    ) AS unrated_count
    FROM profiles p
   WHERE p.notify_rate_reminders = TRUE
     AND EXISTS (
       SELECT 1 FROM watched w
        WHERE w.user_id = p.id
          AND w.recommended IS NULL
          AND w.created_at < now() - INTERVAL '7 days'
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

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header || header !== `Bearer ${secret}`) {
    return unauthorized();
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return missing("DATABASE_URL");

  if (process.env.SENTRY_DSN && !Sentry.isInitialized?.()) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    const result = await client.query(QUERY);
    const inserted = result.rowCount ?? 0;
    console.log(`rate-reminders: inserted=${inserted}`);
    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron send-rate-reminders failed:", message);
    Sentry.captureException(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
