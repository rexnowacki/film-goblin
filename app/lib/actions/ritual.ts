"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { parseMentionUsernames } from "@/lib/ritual/mentions";

const MAX_BODY = 1000;

interface PostedMessage {
  id: string;
  pick_id: number;
  body: string;
  mentions: string[];
  created_at: string;
}

type Result =
  | { ok: true; message: PostedMessage }
  | { ok: false; error: string };

export async function postRitualMessage(body: string): Promise<Result> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Empty message." };
  if (trimmed.length > MAX_BODY) return { ok: false, error: `Message too long (max ${MAX_BODY}).` };

  const user = await getServerUser();
  if (!user) return { ok: false, error: "Sign in to join the ritual." };

  const supabase = await createClient();

  const nowIso = new Date().toISOString();
  const { data: active } = await supabase
    .from("goblin_pick")
    .select("id")
    .lte("effective_at", nowIso)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!active) return { ok: false, error: "No active ritual right now." };

  const usernames = parseMentionUsernames(trimmed);
  let mentionIds: string[] = [];
  if (usernames.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username")
      .in("username", usernames);
    mentionIds = (profs ?? [])
      .map(p => p.id)
      .filter(id => id !== user.id);
  }

  const { data: inserted, error } = await supabase
    .from("goblin_pick_messages")
    .insert({
      pick_id: active.id,
      user_id: user.id,
      body: trimmed,
      mentions: mentionIds,
    })
    .select("id, pick_id, body, mentions, created_at")
    .single();

  if (error || !inserted) return { ok: false, error: error?.message ?? "Insert failed." };

  // Revalidate the archive page (message counts) — the live thread page is
  // realtime-driven and doesn't need a cache bust.
  revalidatePath("/ritual/archive");

  return {
    ok: true,
    message: {
      id: inserted.id,
      pick_id: inserted.pick_id,
      body: inserted.body,
      mentions: inserted.mentions ?? [],
      created_at: inserted.created_at,
    },
  };
}

// Lightweight typeahead used by the chat composer's @-autocomplete.
// Substring match on username AND display_name — same shape as
// `searchFeedTargets` so the UX matches the other search boxes on the site.
export async function searchUsersForMention(prefix: string): Promise<{ id: string; username: string; display_name: string | null; avatar_url: string | null }[]> {
  const q = prefix.trim();
  if (q.length < 1) return [];
  const safe = q.replace(/[%_]/g, ""); // strip ilike wildcards from user input
  if (!safe) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    .order("username", { ascending: true })
    .limit(8);
  return data ?? [];
}
