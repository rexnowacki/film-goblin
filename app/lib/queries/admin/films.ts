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
  untagged = false,
): Promise<{ rows: AdminFilmRow[]; total: number; pageSize: number }> {
  if (untagged) {
    // V2: a film is untagged iff it has zero film_tags rows. The action
    // enforces "Primary subgenre required" — any tagged film has ≥1 row.
    const tagged = await client
      .from("film_tags")
      .select("film_id");
    if (tagged.error) throw tagged.error;
    const taggedIds = Array.from(new Set((tagged.data ?? []).map(r => r.film_id)));

    let q2 = client
      .from("films")
      .select("id, title, year, director, artwork_url, tracking, available, itunes_id", { count: "exact" })
      .order("title", { ascending: true });
    if (q.trim()) q2 = q2.ilike("title", `%${q.trim()}%`);
    if (taggedIds.length > 0) q2 = q2.not("id", "in", `(${taggedIds.join(",")})`);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error, count } = await q2.range(from, to);
    if (error) throw error;
    return {
      rows: (data ?? []) as AdminFilmRow[],
      total: count ?? 0,
      pageSize: PAGE_SIZE,
    };
  }

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
