"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { requireAuthUser } from "@/lib/auth/require-auth-user";

type Client = SupabaseClient<Database>;

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function validate(input: PushSubscriptionInput): void {
  let url: URL;
  try {
    url = new URL(input.endpoint);
  } catch {
    throw new Error("endpoint is not a valid URL");
  }
  if (url.protocol !== "https:") throw new Error("endpoint must be https");
  if (!input.keys?.p256dh || !input.keys?.auth) throw new Error("subscription keys missing");
}

/**
 * The delete-by-endpoint runs via SERVICE ROLE, not the caller: a device
 * re-subscribing under a different account must clear the previous owner's
 * row, which owner-scoped RLS cannot do (endpoint is UNIQUE). Endpoints are
 * unguessable push-service URLs — possession proves device control.
 */
export async function _subscribeToPush(
  client: Client,
  svc: Client,
  input: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  const user = await requireAuthUser(client);
  validate(input);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = svc as unknown as { from: (t: string) => any };
  const { error: delErr } = await s
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", input.endpoint);
  if (delErr) throw delErr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (t: string) => any };
  const { error: insErr } = await c.from("push_subscriptions").insert({
    user_id: user.id,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    user_agent: userAgent,
  });
  if (insErr) throw insErr;
}

export async function _unsubscribeFromPush(client: Client, endpoint: string): Promise<void> {
  await requireAuthUser(client);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (t: string) => any };
  // Owner-scoped RLS: deleting someone else's endpoint silently affects 0 rows.
  const { error } = await c.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw error;
}

export async function subscribeToPush(
  input: PushSubscriptionInput,
  userAgent?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await _subscribeToPush(supabase, serviceRoleClient(), input, userAgent ?? null);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "subscribe failed" };
  }
}

export async function unsubscribeFromPush(endpoint: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await _unsubscribeFromPush(supabase, endpoint);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unsubscribe failed" };
  }
}
