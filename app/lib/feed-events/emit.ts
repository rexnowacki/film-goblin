// Write path for feed_events. Two flavors of the same emission:
//  - emitFeedEvent(pg)   — cron jobs (maintenance route hands jobs a pg.Client)
//  - emitFeedEventSvc(s) — server actions (service-role supabase client)
// Both enforce the 7-day (film_id, event_type) dedup and variant rotation vs.
// the previous event of the same type. ONLY the pg flavor handles milestone
// payload-dedup and the all_time_low same-day price_drop deletion — the Svc
// flavor must not be used for milestone/all_time_low kinds.

import type { Client as PgClient } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  renderCopy, pickVariant, EVENT_PRIORITY,
  type CopyVars, type FeedEventType,
} from "./copy";

export interface FeedEventSpec {
  type: FeedEventType;
  filmId: string | null;
  vars: CopyVars;
  payloadExtra?: Record<string, unknown>;
}

interface BuiltRow {
  event_type: FeedEventType;
  film_id: string | null;
  payload: Record<string, unknown>;
  copy: string;
  priority: number;
}

function buildRow(spec: FeedEventSpec, prevVariant: number | null): BuiltRow {
  const variant = pickVariant(spec.type, spec.vars, prevVariant, Math.random);
  return {
    event_type: spec.type,
    film_id: spec.filmId,
    payload: { ...spec.payloadExtra, vars: spec.vars, variant },
    copy: renderCopy(spec.type, spec.vars, variant),
    priority: EVENT_PRIORITY[spec.type],
  };
}

export async function emitFeedEvent(
  client: PgClient,
  spec: FeedEventSpec,
): Promise<"inserted" | "deduped"> {
  if (spec.type === "milestone") {
    const kind = spec.vars.milestone_kind ?? "catalog";
    const dup = await client.query(
      `SELECT 1 FROM feed_events
       WHERE event_type = 'milestone'
         AND payload -> 'vars' ->> 'milestone_kind' = $1
         AND (payload -> 'vars' ->> 'n')::int = $2
       LIMIT 1`,
      [kind, spec.vars.n ?? 0],
    );
    if (dup.rowCount) return "deduped";
  } else if (spec.filmId) {
    const dup = await client.query(
      `SELECT 1 FROM feed_events
       WHERE film_id = $1 AND event_type = $2
         AND created_at > now() - interval '7 days'
       LIMIT 1`,
      [spec.filmId, spec.type],
    );
    if (dup.rowCount) return "deduped";
  }

  const prev = await client.query(
    `SELECT (payload ->> 'variant')::int AS variant FROM feed_events
     WHERE event_type = $1 ORDER BY created_at DESC LIMIT 1`,
    [spec.type],
  );
  const row = buildRow(spec, prev.rows[0]?.variant ?? null);

  if (spec.type === "all_time_low" && spec.filmId) {
    // ATL supersedes: kill a same-day price_drop for this film.
    await client.query(
      `DELETE FROM feed_events
       WHERE film_id = $1 AND event_type = 'price_drop'
         AND created_at::date = now()::date`,
      [spec.filmId],
    );
  }

  await client.query(
    `INSERT INTO feed_events (event_type, film_id, payload, copy, priority)
     VALUES ($1, $2, $3, $4, $5)`,
    [row.event_type, row.film_id, JSON.stringify(row.payload), row.copy, row.priority],
  );
  return "inserted";
}

export async function emitFeedEventSvc(
  svc: SupabaseClient,
  spec: FeedEventSpec,
): Promise<"inserted" | "deduped"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = svc as unknown as { from: (t: string) => any };

  if (spec.filmId) {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: dup } = await c
      .from("feed_events")
      .select("id")
      .eq("film_id", spec.filmId)
      .eq("event_type", spec.type)
      .gt("created_at", cutoff)
      .limit(1);
    if (dup && dup.length > 0) return "deduped";
  }

  const { data: prev } = await c
    .from("feed_events")
    .select("payload")
    .eq("event_type", spec.type)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prevVariant = typeof prev?.payload?.variant === "number" ? prev.payload.variant : null;
  const row = buildRow(spec, prevVariant);

  const { error } = await c.from("feed_events").insert(row);
  if (error) throw error;
  return "inserted";
}
