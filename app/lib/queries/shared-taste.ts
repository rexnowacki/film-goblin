import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getUserOwnAffinity } from "@/lib/queries/fyp/affinity";
type Client = SupabaseClient<Database>;
export interface SharedTasteSummary { person: { id: string; username: string; avatar_url: string | null }; traits: string[]; sharedFilms: Array<{ id: string; title: string }>; }
export async function getSharedTaste(client: Client, viewerId: string, username: string): Promise<SharedTasteSummary | null> {
  const profile = await client.from("profiles").select("id, username, avatar_url").eq("username", username).maybeSingle();
  if (profile.error || !profile.data || profile.data.id === viewerId) return null;
  const a = viewerId < profile.data.id ? viewerId : profile.data.id; const b = viewerId < profile.data.id ? profile.data.id : viewerId;
  const bond = await client.from("coven_members").select("user_a_id").eq("user_a_id", a).eq("user_b_id", b).maybeSingle();
  if (bond.error || !bond.data) return null;
  const [viewerVec, personVec, viewerWatched, personWatched] = await Promise.all([
    getUserOwnAffinity(client, viewerId), getUserOwnAffinity(client, profile.data.id),
    client.from("watched").select("film_id").eq("user_id", viewerId).eq("recommended", true),
    client.from("watched").select("film_id").eq("user_id", profile.data.id).eq("recommended", true),
  ]);
  const traits = Object.keys(viewerVec.byTag).filter(tag => viewerVec.byTag[tag] > 0 && (personVec.byTag[tag] ?? 0) > 0).sort((x, y) => Math.min(personVec.byTag[y], viewerVec.byTag[y]) - Math.min(personVec.byTag[x], viewerVec.byTag[x])).slice(0, 6);
  const theirs = new Set((personWatched.data ?? []).map(row => row.film_id)); const sharedIds = (viewerWatched.data ?? []).map(row => row.film_id).filter(id => theirs.has(id)).slice(0, 6);
  const films = sharedIds.length ? await client.from("films").select("id, title").in("id", sharedIds) : { data: [], error: null };
  return { person: profile.data, traits, sharedFilms: films.data ?? [] };
}
