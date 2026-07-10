import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { PIT_ARCHIVE_PAGE_SIZE } from "./pitArchive";
import type { SystemFeedEvent } from "./types";

type Client = SupabaseClient<Database>;

/**
 * Reads recent system feed events (feed_events table). RLS grants anon +
 * authenticated SELECT, so this works from both the /home server render and
 * the anon-usable landing page client. feed_events isn't in the generated
 * Database type yet (see app/lib/supabase/CLAUDE.md), so — per repo law —
 * we cast to a minimal `.from` shape rather than hand-editing types.ts.
 */
export async function getRecentSystemEvents(
  client: Client,
  limit = 12,
): Promise<SystemFeedEvent[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (t: string) => any };
  const { data, error } = await c
    .from("feed_events")
    .select("id, event_type, film_id, payload, copy, priority, created_at, film:films(id, title, artwork_url)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("getRecentSystemEvents failed:", error.message);
    return [];
  }
  // PostgREST embed may type as array — normalize (see components/CLAUDE.md).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    ...r,
    film: Array.isArray(r.film) ? (r.film[0] ?? null) : (r.film ?? null),
  }));
}

/**
 * Reads the Pit archive in reverse chronological order. This deliberately
 * does not apply seen, age, cadence, or watchlist selection rules: the
 * archive is a reference surface, not an interruption surface.
 */
export async function getPitArchiveEvents(
  client: Client,
  opts: { before?: string; limit?: number } = {},
): Promise<SystemFeedEvent[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (t: string) => any };
  const limit = Math.max(1, Math.min(opts.limit ?? PIT_ARCHIVE_PAGE_SIZE, 100));
  let query = c
    .from("feed_events")
    .select("id, event_type, film_id, payload, copy, priority, created_at, film:films(id, title, artwork_url)")
    .order("created_at", { ascending: false });
  if (opts.before) query = query.lt("created_at", opts.before);
  const { data, error } = await query.limit(limit);
  if (error) {
    console.warn("getPitArchiveEvents failed:", error.message);
    return [];
  }
  // PostgREST embeds a to-one relationship as an array in some responses.
  // Keep this normalization identical to getRecentSystemEvents.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    ...r,
    film: Array.isArray(r.film) ? (r.film[0] ?? null) : (r.film ?? null),
  }));
}
