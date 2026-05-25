import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function requireAuthUser(client: SupabaseClient): Promise<User> {
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("unauthenticated");
  return user;
}
