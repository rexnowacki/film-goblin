"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { requireAdminUser } from "@/lib/auth/require-admin";

const TABLE = "site_settings";

// Minimal client shape the read path needs. Lets tests inject a fake without
// standing up real Supabase. Module-local on purpose (a "use server" file may
// only export async functions).
type ReaderClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: { value: unknown } | null; error: unknown }>;
      };
    };
  };
};

// Private read: never throws. Returns `fallback` on missing row or any error,
// and only treats a JSON boolean `true` as enabled.
export async function _readSettingBool(
  client: ReaderClient,
  key: string,
  fallback: boolean,
): Promise<boolean> {
  try {
    const { data, error } = await client.from(TABLE).select("value").eq("key", key).maybeSingle();
    if (error || !data) return fallback;
    return data.value === true;
  } catch {
    return fallback;
  }
}

export async function readSettingBool(key: string, fallback: boolean): Promise<boolean> {
  const sr = serviceRoleClient() as unknown as ReaderClient;
  return _readSettingBool(sr, key, fallback);
}

// Used by signUp before the user is authenticated. No admin guard — it reveals
// only a single boolean. Fail-closed: defaults to gated (true).
export async function isInviteGateEnabled(): Promise<boolean> {
  return readSettingBool("invite_gate", true);
}

// Module-private upsert. `client` is the service-role client (cast to any
// because `site_settings` is not yet in lib/supabase/types.ts).
async function writeSetting(
  client: ReturnType<typeof serviceRoleClient>,
  key: string,
  value: unknown,
  userId: string,
): Promise<void> {
  await (client as any).from(TABLE).upsert(
    { key, value, updated_at: new Date().toISOString(), updated_by: userId },
    { onConflict: "key" },
  );
}

// Admin action: flip the invite gate. Throws NotAdminError for non-admins.
export async function setInviteGate(enabled: boolean): Promise<void> {
  const supabase = await createClient();
  const user = await requireAdminUser(supabase);
  await writeSetting(serviceRoleClient(), "invite_gate", enabled, user.id);
  revalidatePath("/admin/site-settings");
}

// Read for the admin page: current value + when it last changed.
export async function getInviteGateSetting(): Promise<{ enabled: boolean; updatedAt: string | null }> {
  const sr = serviceRoleClient();
  const { data } = await (sr as any)
    .from(TABLE)
    .select("value, updated_at")
    .eq("key", "invite_gate")
    .maybeSingle();
  if (!data) return { enabled: true, updatedAt: null };
  return { enabled: data.value === true, updatedAt: data.updated_at ?? null };
}
