"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { requireAuthUser } from "@/lib/auth/require-auth-user";

type Client = SupabaseClient<Database>;

export async function _sendCovenRequest(client: Client, toUserId: string): Promise<{ id: string }> {
  const user = await requireAuthUser(client);
  if (user.id === toUserId) throw new Error("cannot invite yourself to your own coven");
  const { data, error } = await client
    .from("coven_requests")
    .insert({ from_user_id: user.id, to_user_id: toUserId, status: "pending" })
    .select("id").single();
  if (error) throw error;
  return { id: data!.id };
}

export async function _acceptCovenRequest(client: Client, requestId: string): Promise<void> {
  const user = await requireAuthUser(client);
  const { error } = await client
    .from("coven_requests")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) throw error;
}

export async function _declineCovenRequest(client: Client, requestId: string): Promise<void> {
  const user = await requireAuthUser(client);
  const { error } = await client
    .from("coven_requests")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) throw error;
}

export async function _leaveCoven(client: Client, otherUserId: string): Promise<void> {
  const user = await requireAuthUser(client);
  const a = user.id < otherUserId ? user.id : otherUserId;
  const b = user.id < otherUserId ? otherUserId : user.id;
  const { error } = await client
    .from("coven_members")
    .delete()
    .eq("user_a_id", a)
    .eq("user_b_id", b);
  if (error) throw error;
}

export async function sendCovenRequest(toUserId: string, targetUsername?: string) {
  const c = await createClient();
  const result = await _sendCovenRequest(c, toUserId);
  revalidatePath("/coven");
  if (targetUsername) revalidatePath(`/p/${targetUsername}`);
  return result;
}

export async function acceptCovenRequest(requestId: string) {
  const c = await createClient();
  await _acceptCovenRequest(c, requestId);
  revalidatePath("/coven");
  revalidatePath("/home");
}

export async function declineCovenRequest(requestId: string) {
  const c = await createClient();
  await _declineCovenRequest(c, requestId);
  revalidatePath("/coven");
  revalidatePath("/home");
}

export async function leaveCoven(otherUserId: string, targetUsername?: string) {
  const c = await createClient();
  await _leaveCoven(c, otherUserId);
  revalidatePath("/coven");
  if (targetUsername) revalidatePath(`/p/${targetUsername}`);
}
