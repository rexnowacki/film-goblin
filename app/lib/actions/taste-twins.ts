"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser } from "@/lib/auth/require-auth-user";
import { _sendCovenRequest } from "@/lib/actions/coven";
import type { Database } from "@/lib/supabase/types";
type Client = SupabaseClient<Database>;

export async function _suppressTasteTwin(client: Client, candidateId: string, now = new Date()): Promise<void> {
  const user = await requireAuthUser(client);
  if (candidateId === user.id) throw new Error("cannot suppress yourself");
  const until = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await client.from("taste_twin_suppressions").upsert({ viewer_id: user.id, candidate_id: candidateId, suppressed_until: until }, { onConflict: "viewer_id,candidate_id" });
  if (error) throw error;
}
export async function suppressTasteTwin(candidateId: string): Promise<void> {
  const client = await createClient(); await _suppressTasteTwin(client, candidateId); revalidatePath("/coven"); revalidatePath("/home");
}
export async function requestTasteTwin(candidateId: string): Promise<{ id: string }> {
  const client = await createClient();
  const result = await _sendCovenRequest(client, candidateId);
  revalidatePath("/coven"); revalidatePath("/home");
  return result;
}
