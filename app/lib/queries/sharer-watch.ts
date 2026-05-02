import { serviceRoleClient } from "@/lib/supabase/service-role";

export interface SharerWatch {
  username: string;
  watched_at: string;
  note: string | null;
  recommended: boolean | null;
}

/**
 * Fetches the named user's most recent watch row for the given film.
 *
 * Uses the service-role client to BYPASS RLS by design. Rationale: when a
 * user explicitly taps Share on a film page, that tap is the consent
 * signal; their `broadcast_watched` setting governs the passive coven
 * feed, not explicit shares. The recipient — who is typically outside the
 * sharer's coven — needs to see the watch context for the share to be
 * meaningful at all.
 *
 * Containing this single privacy override to one helper makes the
 * exposure auditable. Returns null silently for invalid usernames,
 * unknown users, or users with no watch row for this film.
 */
export async function getSharerWatchForFilm(
  username: string,
  filmId: string,
): Promise<SharerWatch | null> {
  const admin = serviceRoleClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, username")
    .ilike("username", username)
    .maybeSingle();
  if (!profile) return null;

  const { data: watch } = await admin
    .from("watched")
    .select("watched_at, note, recommended")
    .eq("user_id", profile.id)
    .eq("film_id", filmId)
    .order("watched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!watch) return null;

  return {
    username: profile.username,
    watched_at: watch.watched_at,
    note: watch.note,
    recommended: watch.recommended,
  };
}
