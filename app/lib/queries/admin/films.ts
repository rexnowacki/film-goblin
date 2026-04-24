import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface AdminFilmRow {
  id: string;
  title: string;
  year: number;
  director: string;
  artwork_url: string;
  tracking: boolean;
  available: boolean;
  itunes_id: number | null;
}

const PAGE_SIZE = 20;

export async function listFilmsForAdmin(
  client: Client,
  q: string,
  page: number,
): Promise<{ rows: AdminFilmRow[]; total: number; pageSize: number }> {
  let query = client
    .from("films")
    .select("id, title, year, director, artwork_url, tracking, available, itunes_id", { count: "exact" })
    .order("title", { ascending: true });

  if (q.trim()) {
    query = query.ilike("title", `%${q.trim()}%`);
  }
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return {
    rows: (data ?? []) as AdminFilmRow[],
    total: count ?? 0,
    pageSize: PAGE_SIZE,
  };
}
