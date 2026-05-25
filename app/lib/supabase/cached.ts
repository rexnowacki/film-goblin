import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "./server";
import { serviceRoleClient } from "./service-role";
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

// unstable_cache callbacks cannot use cookies() — createClient() from server.ts
// reads cookies for SSR session hydration and will throw inside the cache boundary.
// These queries are public (no per-user RLS scoping), so serviceRoleClient() is correct.
export const getLandingMarquee = unstable_cache(
  async () => _getLandingMarquee(serviceRoleClient()),
  ["landing-marquee"],
  { revalidate: 300, tags: ["films"] },
);

export const getActiveRitualPick = unstable_cache(
  async () => _getActiveRitualPick(serviceRoleClient()),
  ["active-ritual-pick"],
  { revalidate: 300, tags: ["goblin-pick"] },
);
