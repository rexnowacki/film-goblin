import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";

export interface AdminStats {
  users: number;
  filmsTotal: number;
  filmsTracking: number;
  watchlistEntries: number;
  watchedLogs: number;
  pendingRequests: number;
}

type Client = SupabaseClient<Database>;

async function count(client: Client, build: (client: Client) => PromiseLike<{ count: number | null }>): Promise<number> {
  const { count } = await build(client);
  return count ?? 0;
}

export async function _getAdminStats(client: Client): Promise<AdminStats> {
  const head = { count: "exact" as const, head: true };
  const [users, filmsTotal, filmsTracking, watchlistEntries, watchedLogs, pendingRequests] =
    await Promise.all([
      count(client, (c) => (c as any).from("profiles").select("*", head)),
      count(client, (c) => (c as any).from("films").select("*", head)),
      count(client, (c) => (c as any).from("films").select("*", head).eq("tracking", true)),
      count(client, (c) => (c as any).from("watchlists").select("*", head)),
      count(client, (c) => (c as any).from("watched").select("*", head)),
      count(client, (c) => (c as any).from("film_requests").select("*", head).eq("status", "pending")),
    ]);

  return { users, filmsTotal, filmsTracking, watchlistEntries, watchedLogs, pendingRequests };
}

export async function getAdminStats(): Promise<AdminStats> {
  return _getAdminStats(serviceRoleClient());
}
