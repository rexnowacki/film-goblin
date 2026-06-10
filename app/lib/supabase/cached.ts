import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "./server";
import { serviceRoleClient } from "./service-role";
import { getRecentlySummoned as _getRecentlySummoned } from "@/lib/queries/films";
import { getLandingFeed as _getLandingFeed } from "@/lib/queries/landing";
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

// unstable_cache callbacks cannot use cookies() — createClient() from server.ts
// reads cookies for SSR session hydration and will throw inside the cache boundary.
// These queries are public (no per-user RLS scoping), so serviceRoleClient() is correct.
export const getRecentlySummoned = unstable_cache(
  async () => _getRecentlySummoned(serviceRoleClient()),
  ["recently-summoned"],
  { revalidate: 300, tags: ["films"] },
);

// Landing feed card. Failure degrades to an empty list (page hides the card)
// rather than 500ing the front door. Nothing revalidates the tag — the 300s
// TTL is the only refresh, which is fine for a logged-out landing page.
export const getLandingFeed = unstable_cache(
  async () => {
    try {
      return await _getLandingFeed(serviceRoleClient());
    } catch {
      return [];
    }
  },
  ["landing-feed"],
  { revalidate: 300, tags: ["landing-feed"] },
);

export const getActiveRitualPick = unstable_cache(
  async () => _getActiveRitualPick(serviceRoleClient()),
  ["active-ritual-pick"],
  { revalidate: 300, tags: ["goblin-pick"] },
);
