import { cache } from "react";
import { createClient } from "./server";

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
