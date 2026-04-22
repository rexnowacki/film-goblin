import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getPublishedReviewsForFilm(client: Client, filmId: string) {
  const { data, error } = await client
    .from("reviews")
    .select("id, title, body, pullquote, published_at, author_user_id, profiles!reviews_author_user_id_fkey(handle, display_name, avatar_url)")
    .eq("film_id", filmId)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
