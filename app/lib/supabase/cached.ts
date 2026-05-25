import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "./server";
import { getLandingMarquee as _getLandingMarquee } from "@/lib/queries/films";
import { getActiveRitualPick as _getActiveRitualPick } from "@/lib/queries/ritual";

// Per-request memoized auth lookup. Within a single RSC render, TopNav,
// BottomNav, and the page tree all need the user; without dedup that's
// 3+ JWT-validation round-trips to Supabase auth. cache() collapses
// them to one. Does NOT cache across requests — middleware's own
// getUser() call still happens separately.
export const getServerUser = cache(async () => {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  return user;
});

// Cross-request cache for public, rarely-changing data.
// These use unstable_cache so the underlying DB query fires once per TTL
// window rather than on every request.
//
// Invalidation: admin actions that mutate films call revalidateTag("films");
// admin actions that mutate goblin-pick call revalidateTag("goblin-pick").
// Do NOT use these wrappers for user-specific queries.

export const getLandingMarquee = unstable_cache(
  async () => {
    const client = await createClient();
    return _getLandingMarquee(client);
  },
  ["landing-marquee"],
  { revalidate: 300, tags: ["films"] },
);

export const getActiveRitualPick = unstable_cache(
  async () => {
    const client = await createClient();
    return _getActiveRitualPick(client);
  },
  ["active-ritual-pick"],
  { revalidate: 300, tags: ["goblin-pick"] },
);
