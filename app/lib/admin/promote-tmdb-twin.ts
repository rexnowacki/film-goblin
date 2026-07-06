import { emitFeedEventSvc } from "@/lib/feed-events/emit";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export interface ItunesGraft {
  itunes_id: number;
  itunes_url: string;
  tracking: boolean;
  available: boolean;
  artwork_url: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FilmsClient = { from: (t: string) => any };

/**
 * When an admin adds a film via Apple TV / iTunes that was already added from
 * TMDB while it was in theaters, the catalog would grow a duplicate row — and
 * the user data (watch logs, watchlists, reviews) would stay on the old one.
 * Instead, graft the iTunes identity onto the existing TMDB-only row and
 * return its id so the caller can skip the insert. Returns null when there is
 * nothing to promote.
 */
export async function promoteTmdbTwin(
  c: FilmsClient,
  tmdbId: number | null,
  graft: ItunesGraft,
): Promise<string | null> {
  if (tmdbId === null) return null;

  const { data: twin, error } = await c
    .from("films")
    .select("id, title, artwork_url")
    .eq("tmdb_id", tmdbId)
    .is("itunes_id", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!twin) return null;

  const patch: Record<string, unknown> = {
    itunes_id: graft.itunes_id,
    itunes_url: graft.itunes_url,
    tracking: graft.tracking,
    available: graft.available,
  };
  // Keep the twin's curated artwork; only backfill when it has none.
  if (!twin.artwork_url && graft.artwork_url) {
    patch.artwork_url = graft.artwork_url;
  }

  const { error: updateError } = await c
    .from("films")
    .update(patch)
    .eq("id", twin.id)
    .is("itunes_id", null);
  if (updateError) throw updateError;

  try {
    await emitFeedEventSvc(serviceRoleClient(), {
      type: "now_on_apple",
      filmId: twin.id,
      vars: { title: twin.title },
    });
  } catch (err) {
    console.warn("feed event now_on_apple failed:", err instanceof Error ? err.message : err);
  }

  return twin.id;
}
