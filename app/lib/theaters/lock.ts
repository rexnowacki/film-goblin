import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function acquireCronLock(
  client: Client,
  key: string,
  ttlMs = 10 * 60 * 1000,
): Promise<boolean> {
  const lockedUntil = new Date(Date.now() + ttlMs).toISOString();
  const { data, error } = await client.rpc("acquire_cron_lock", {
    p_key: key,
    p_locked_until: lockedUntil,
  });
  if (error) throw error;
  return data === true;
}
