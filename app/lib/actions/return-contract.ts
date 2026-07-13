"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser } from "@/lib/auth/require-auth-user";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
const KEY_RE = /^(coven_request|profile_photo|taste_twin):[A-Za-z0-9_-]{1,120}$/;

export async function _deferReturnContract(client: Client, contractKey: string, requestedUntil: string): Promise<void> {
  const user = await requireAuthUser(client);
  if (!KEY_RE.test(contractKey)) throw new Error("invalid return contract key");
  const now = Date.now();
  const requested = Date.parse(requestedUntil);
  if (!Number.isFinite(requested) || requested <= now) throw new Error("deferral must be in the future");
  const ceiling = now + 24 * 60 * 60 * 1000 + 60_000;
  if (requested > ceiling) throw new Error("deferral exceeds its allowed window");
  const { error } = await client.from("return_contract_deferrals").upsert({
    user_id: user.id,
    contract_key: contractKey,
    deferred_until: new Date(requested).toISOString(),
  }, { onConflict: "user_id,contract_key" });
  if (error) throw error;
}

export async function deferReturnContract(contractKey: string, requestedUntil: string): Promise<void> {
  const client = await createClient();
  await _deferReturnContract(client, contractKey, requestedUntil);
  revalidatePath("/home");
}
