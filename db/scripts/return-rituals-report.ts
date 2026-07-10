import "dotenv/config";
import pg from "pg";

interface CountRow { count: string }
interface EventCountRow { event_name: string; events: string; users: string }

function n(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function relationExists(client: pg.Client, name: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>("SELECT to_regclass($1) IS NOT NULL AS exists", [`public.${name}`]);
  return rows[0]?.exists ?? false;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (!(await relationExists(client, "product_events"))) {
      console.log("Return Rituals: product_events not available yet");
      return;
    }

    // A pg.Client is a single connection; keep queries sequential. Concurrent
    // client.query calls are deprecated and will be rejected by pg 9.
    const active = await client.query<CountRow>(
      "SELECT count(DISTINCT user_id) AS count FROM product_events WHERE occurred_at >= now() - interval '7 days'",
    );
    const sessions = await client.query<CountRow>(
      "SELECT count(DISTINCT (user_id, session_id)) AS count FROM product_events WHERE occurred_at >= now() - interval '7 days'",
    );
    const events = await client.query<EventCountRow>(`
      SELECT event_name, count(*) AS events, count(DISTINCT user_id) AS users
      FROM product_events
      WHERE occurred_at >= now() - interval '7 days'
      GROUP BY event_name
      ORDER BY event_name
    `);

    const meaningfulNames = new Set([
      "return_contract_acted", "taste_twin_request_sent", "gazing_created",
      "gazing_rsvp_changed", "gazing_closed", "attendance_confirmed",
      "aftermath_verdict_recorded", "continuation_prompt_acted",
    ]);
    const meaningfulUsers = await client.query<CountRow>(`
      WITH session_starts AS (
        SELECT
          user_id,
          session_id,
          min(occurred_at) AS started_at,
          lag(min(occurred_at)) OVER (
            PARTITION BY user_id ORDER BY min(occurred_at)
          ) AS previous_started_at
        FROM product_events
        WHERE event_name = 'session_started'
          AND occurred_at >= now() - interval '8 days'
        GROUP BY user_id, session_id
      ), meaningful_sessions AS (
        SELECT DISTINCT s.user_id, s.session_id
        FROM session_starts s
        JOIN product_events e
          ON e.user_id = s.user_id AND e.session_id = s.session_id
        WHERE s.started_at >= now() - interval '7 days'
          AND s.previous_started_at IS NOT NULL
          AND s.started_at - s.previous_started_at >= interval '6 hours'
          AND e.event_name = ANY($1::text[])
      )
      SELECT count(DISTINCT user_id) AS count FROM meaningful_sessions
    `, [[...meaningfulNames]]);

    console.log("Return Rituals — trailing 7 days");
    console.log(`active_users=${n(active.rows[0]?.count)}`);
    console.log(`sessions=${n(sessions.rows[0]?.count)}`);
    console.log(`meaningful_return_users=${n(meaningfulUsers.rows[0]?.count)}`);
    console.log("events:");
    for (const row of events.rows) {
      console.log(`  ${row.event_name}: events=${n(row.events)} users=${n(row.users)}`);
    }

    for (const future of ["return_contract_deferrals", "taste_twin_suppressions", "gazing_invitees"] as const) {
      console.log(`${future}=${await relationExists(client, future) ? "available" : "not available yet"}`);
    }
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
