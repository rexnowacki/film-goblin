import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface CreateTheaterNotificationsResult {
  notificationsCreated: number;
}

export async function createTheaterNotifications(
  client: Client,
  showingIds?: string[],
): Promise<CreateTheaterNotificationsResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (client as unknown as { from: (table: string) => any })
    .from("theater_showing_matches")
    .select(`
      showing_id,
      film_id,
      confidence,
      status,
      showing:theater_showings!inner(
        id,
        title,
        date_label,
        date_precision,
        is_active,
        theater:theaters!inner(name)
      )
    `)
    .in("status", ["auto", "confirmed"])
    .gte("confidence", 0.95)
    .eq("showing.is_active", true);
  if (showingIds && showingIds.length > 0) query = query.in("showing_id", showingIds);
  const { data, error } = await query;
  if (error) throw error;

  const eligible = (data ?? []).filter((row: any) => {
    const showing = Array.isArray(row.showing) ? row.showing[0] : row.showing;
    return showing?.date_label?.toLowerCase() !== "now playing";
  });
  if (eligible.length === 0) return { notificationsCreated: 0 };

  const filmIds: string[] = Array.from(new Set<string>(eligible.map((row: any) => String(row.film_id))));
  const watchlists = await client
    .from("watchlists")
    .select("user_id, film_id")
    .in("film_id", filmIds);
  if (watchlists.error) throw watchlists.error;

  const rows: Array<{
    user_id: string;
    kind: "theater_showing_match";
    actor_user_id: null;
    payload: {
      showing_id: string;
      film_id: string;
      theater_name: string;
      title: string;
      date_label: string | null;
    };
  }> = [];
  for (const match of eligible) {
    const showing = Array.isArray(match.showing) ? match.showing[0] : match.showing;
    const theater = Array.isArray(showing.theater) ? showing.theater[0] : showing.theater;
    for (const w of watchlists.data ?? []) {
      if (w.film_id !== match.film_id) continue;
      rows.push({
        user_id: w.user_id,
        kind: "theater_showing_match" as const,
        actor_user_id: null,
        payload: {
          showing_id: match.showing_id,
          film_id: match.film_id,
          theater_name: theater?.name ?? "a local theater",
          title: showing.title,
          date_label: showing.date_label,
        },
      });
    }
  }

  if (rows.length === 0) return { notificationsCreated: 0 };
  const showingIdsForRows = Array.from(new Set(rows.map((row) => String(row.payload.showing_id))));
  const userIdsForRows = Array.from(new Set(rows.map((row) => row.user_id)));
  const existing = await client
    .from("notifications")
    .select("user_id, payload")
    .eq("kind", "theater_showing_match")
    .in("user_id", userIdsForRows);
  if (existing.error) throw existing.error;
  const existingKeys = new Set(
    (existing.data ?? [])
      .map((row) => {
        const showingId = (row.payload as { showing_id?: string } | null)?.showing_id;
        return showingId && showingIdsForRows.includes(showingId) ? `${row.user_id}:${showingId}` : null;
      })
      .filter((key): key is string => Boolean(key)),
  );
  const newRows = rows.filter((row) => !existingKeys.has(`${row.user_id}:${row.payload.showing_id}`));
  if (newRows.length === 0) return { notificationsCreated: 0 };

  const { data: inserted, error: insertErr } = await client
    .from("notifications")
    .insert(newRows)
    .select("id");
  if (insertErr) throw insertErr;
  return { notificationsCreated: inserted?.length ?? 0 };
}
