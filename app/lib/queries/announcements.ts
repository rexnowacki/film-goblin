import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

export interface PendingAnnouncement {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_href: string | null;
}

/**
 * Returns the oldest published announcement that:
 *   - the user has not yet dismissed
 *   - is targeted at this user (audience='everyone' OR they're in the recipient list)
 *
 * Returns null when there's nothing pending. Logs and returns null on DB error
 * so the layout never blocks page render on this query.
 */
export async function getPendingAnnouncement(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<PendingAnnouncement | null> {
  // Sub-1: ids the user has dismissed.
  const { data: dismissed, error: dErr } = await client
    .from("announcement_dismissals")
    .select("announcement_id")
    .eq("user_id", userId);
  if (dErr) {
    console.error("getPendingAnnouncement: dismissals lookup failed:", dErr);
    return null;
  }
  const dismissedIds = (dismissed ?? []).map(r => r.announcement_id);

  // Sub-2: candidate announcements (published, not dismissed by this user).
  // Bound the candidate set so this query runs in O(constant) per page load
  // even if the announcements table grows large. 200 is a generous ceiling —
  // we expect the active (unarchived) set to stay in the low tens.
  let candidatesQ = client
    .from("announcements")
    .select("id, title, body, cta_label, cta_href, audience, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .limit(200);
  if (dismissedIds.length > 0) {
    // PostgREST-js .not() with operator='in' requires the parenthesised string
    // form; the array form is only available on .in(). Values are UUIDs from
    // a Supabase query (never user-supplied text), so interpolation is safe.
    candidatesQ = candidatesQ.not("id", "in", `(${dismissedIds.join(",")})`);
  }
  const { data: candidates, error: cErr } = await candidatesQ;
  if (cErr) {
    console.error("getPendingAnnouncement: candidates lookup failed:", cErr);
    return null;
  }
  if (!candidates || candidates.length === 0) return null;

  // Sub-3: filter by audience. "everyone" passes. "specific" requires a
  // recipient row for this user.
  const everyone = candidates.filter(c => c.audience === "everyone");
  const specific = candidates.filter(c => c.audience === "specific");

  let specificForMe: typeof specific = [];
  if (specific.length > 0) {
    const { data: myRecipients, error: rErr } = await client
      .from("announcement_recipients")
      .select("announcement_id")
      .eq("user_id", userId)
      .in("announcement_id", specific.map(s => s.id));
    if (rErr) {
      console.error("getPendingAnnouncement: recipients lookup failed:", rErr);
      return null;
    }
    const myRecipientIds = new Set((myRecipients ?? []).map(r => r.announcement_id));
    specificForMe = specific.filter(s => myRecipientIds.has(s.id));
  }

  // Combined, FIFO. Each sub-array is created_at-ascending (from the
  // candidates query order), but interleaving the two requires a merge sort.
  const eligible = [...everyone, ...specificForMe].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  if (eligible.length === 0) return null;
  const pick = eligible[0];
  return {
    id: pick.id,
    title: pick.title,
    body: pick.body,
    cta_label: pick.cta_label,
    cta_href: pick.cta_href,
  };
}
