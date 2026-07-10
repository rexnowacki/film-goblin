"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser } from "@/lib/auth/require-auth-user";
import type { Database, Json } from "@/lib/supabase/types";
import { validateProductEvent, type ProductEventInput } from "@/lib/product-events/registry";

type Client = SupabaseClient<Database>;
const BATCH_CAP = 20;

export async function _recordProductEvents(client: Client, events: ProductEventInput[]): Promise<number> {
  await requireAuthUser(client);
  if (events.length < 1 || events.length > BATCH_CAP) throw new Error("event batch must contain 1 to 20 rows");
  const validated = events.map(event => validateProductEvent(event));
  const { data, error } = await client.rpc("record_product_events", { events: validated as unknown as Json });
  if (error) throw error;
  return data ?? 0;
}

export async function recordProductEvents(events: ProductEventInput[]): Promise<{ recorded: number }> {
  const client = await createClient();
  return { recorded: await _recordProductEvents(client, events) };
}
