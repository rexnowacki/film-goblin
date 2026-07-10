"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

const IMPRESSION_BATCH_CAP = 10;

export async function _recordPitImpressions(client: Client, eventIds: string[], digestKey?: string): Promise<void> {
  if (eventIds.length === 0) return;
  const capped = eventIds.slice(0, IMPRESSION_BATCH_CAP);
  const { error } = await client.rpc("record_pit_impressions", {
    p_event_ids: capped,
    ...(digestKey ? { p_digest_key: digestKey } : {}),
  });
  if (error) throw error;
}

/** Fire-and-forget: impression loss is free, so all failures are swallowed. */
export async function recordPitImpressions(eventIds: string[], digestKey?: string): Promise<void> {
  try {
    const client = await createClient();
    await _recordPitImpressions(client, eventIds, digestKey);
  } catch (e) {
    console.warn("recordPitImpressions failed (dropped):", e);
  }
}
