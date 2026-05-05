import { serviceRoleClient } from "@/lib/supabase/service-role";

export interface AdminTheaterShowingRow {
  id: string;
  title: string;
  date_label: string | null;
  starts_on: string | null;
  showtime_label: string | null;
  category_labels: string[];
  source_url: string;
  is_active: boolean;
  last_seen_at: string;
  theater: { name: string; slug: string };
  matches: Array<{
    id: string;
    confidence: number;
    match_type: string;
    status: string;
    film: { id: string; title: string; year: number } | null;
  }>;
}

export async function listTheaterShowingsForAdmin(opts: {
  status?: string;
  theaterSlug?: string;
  limit?: number;
} = {}): Promise<AdminTheaterShowingRow[]> {
  const sb = serviceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = sb
    .from("theater_showings")
    .select(`
      id,
      title,
      date_label,
      starts_on,
      showtime_label,
      category_labels,
      source_url,
      is_active,
      last_seen_at,
      theater:theaters!inner(name, slug),
      matches:theater_showing_matches(
        id,
        confidence,
        match_type,
        status,
        film:films(id, title, year)
      )
    `)
    .order("last_seen_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.theaterSlug) query = query.eq("theater.slug", opts.theaterSlug);
  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as any[])
    .map((row) => ({
      ...row,
      theater: Array.isArray(row.theater) ? row.theater[0] : row.theater,
      matches: (row.matches ?? []).map((m: any) => ({
        ...m,
        film: Array.isArray(m.film) ? m.film[0] : m.film,
      })),
    }))
    .filter((row) => !opts.status || row.matches.some((m: { status: string }) => m.status === opts.status));
}
