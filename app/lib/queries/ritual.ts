import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface RitualPick {
  pick_id: number;
  effective_at: string;
  closes_at: string | null; // effective_at of next queued pick, or null = indefinite
  whisper_text: string | null;
  film: {
    id: string;
    title: string;
    director: string;
    year: number;
    artwork_url: string | null;
    itunes_url: string;
  };
}

export interface RitualMessage {
  id: string;
  pick_id: number;
  body: string;
  mentions: string[];
  created_at: string;
  author: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface ArchivedRitual {
  pick_id: number;
  effective_at: string;
  message_count: number;
  film: {
    id: string;
    title: string;
    director: string;
    year: number;
    artwork_url: string | null;
  };
}

export async function getActiveRitualPick(client: Client): Promise<RitualPick | null> {
  const nowIso = new Date().toISOString();

  const { data: active } = await client
    .from("goblin_pick")
    .select("id, effective_at, whisper_text, films(id, title, director, year, artwork_url, itunes_url)")
    .lte("effective_at", nowIso)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!active?.films) return null;

  const { data: nextQueued } = await client
    .from("goblin_pick")
    .select("effective_at")
    .gt("effective_at", nowIso)
    .order("effective_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const film = active.films as unknown as RitualPick["film"];
  return {
    pick_id: active.id,
    effective_at: active.effective_at,
    closes_at: nextQueued?.effective_at ?? null,
    whisper_text: active.whisper_text ?? null,
    film,
  };
}

export async function getRitualPickById(client: Client, pickId: number): Promise<RitualPick | null> {
  const { data } = await client
    .from("goblin_pick")
    .select("id, effective_at, whisper_text, films(id, title, director, year, artwork_url, itunes_url)")
    .eq("id", pickId)
    .maybeSingle();
  if (!data?.films) return null;

  const { data: next } = await client
    .from("goblin_pick")
    .select("effective_at")
    .gt("effective_at", data.effective_at)
    .order("effective_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    pick_id: data.id,
    effective_at: data.effective_at,
    closes_at: next?.effective_at ?? null,
    whisper_text: data.whisper_text ?? null,
    film: data.films as unknown as RitualPick["film"],
  };
}

// Messages oldest-first so the chat reads top-to-bottom in chronological order.
export async function getRitualMessages(client: Client, pickId: number, limit = 200): Promise<RitualMessage[]> {
  const { data } = await client
    .from("goblin_pick_messages")
    .select("id, pick_id, body, mentions, created_at, profiles!user_id(id, username, display_name, avatar_url)")
    .eq("pick_id", pickId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!data) return [];
  return data
    .filter((r): r is typeof r & { profiles: NonNullable<typeof r.profiles> } => Boolean(r.profiles))
    .map(r => ({
      id: r.id,
      pick_id: r.pick_id,
      body: r.body,
      mentions: r.mentions ?? [],
      created_at: r.created_at,
      author: r.profiles as unknown as RitualMessage["author"],
    }));
}

export async function getArchivedRituals(client: Client, limit = 30): Promise<ArchivedRitual[]> {
  const nowIso = new Date().toISOString();

  // Active pick id (so we can exclude it from "archived")
  const { data: active } = await client
    .from("goblin_pick")
    .select("id")
    .lte("effective_at", nowIso)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const activePickId = active?.id ?? -1;

  const { data: rows } = await client
    .from("goblin_pick")
    .select("id, effective_at, films(id, title, director, year, artwork_url)")
    .lte("effective_at", nowIso)
    .neq("id", activePickId)
    .order("effective_at", { ascending: false })
    .limit(limit);

  if (!rows) return [];

  const ids = rows.map(r => r.id);
  const counts = new Map<number, number>();
  if (ids.length > 0) {
    const { data: msgRows } = await client
      .from("goblin_pick_messages")
      .select("pick_id")
      .in("pick_id", ids);
    for (const m of msgRows ?? []) {
      counts.set(m.pick_id, (counts.get(m.pick_id) ?? 0) + 1);
    }
  }

  return rows
    .filter((r): r is typeof r & { films: NonNullable<typeof r.films> } => Boolean(r.films))
    .map(r => ({
      pick_id: r.id,
      effective_at: r.effective_at,
      message_count: counts.get(r.id) ?? 0,
      film: r.films as unknown as ArchivedRitual["film"],
    }));
}
