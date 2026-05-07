// app/lib/actions/invite-codes.ts
"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { requireAdmin } from "@/lib/auth/require-admin";
import { clearInviteCodeCookie } from "@/lib/actions/invite-cookie";

// Used in signUp before user creation — SELECT only, no writes.
// Returns true if the code exists, is not revoked, and has remaining capacity.
export async function peekInviteCode(code: string | null): Promise<boolean> {
  if (!code) return false;
  const sr = serviceRoleClient();
  const { data } = await (sr.from("invite_codes") as any)
    .select("use_count, max_uses, revoked")
    .eq("code", code)
    .maybeSingle();
  if (!data) return false;
  return !data.revoked && data.use_count < data.max_uses;
}

// Used in signUp after user creation — race-safe increment via DB RPC.
// Clears the cookie regardless of outcome.
export async function burnInviteCode(code: string, newUserId: string): Promise<void> {
  await clearInviteCodeCookie();
  const sr = serviceRoleClient();
  await (sr as any).rpc("burn_invite_code", { p_code: code, p_user_id: newUserId });
}

// Admin: generate a new code with owner_user_id = null (batch/admin code).
export async function adminCreateInviteCode(
  formData: FormData
): Promise<{ code: string } | { error: string }> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const label = String(formData.get("label") || "").trim() || null;
  const maxUses = Math.max(1, parseInt(String(formData.get("max_uses") || "5"), 10) || 5);
  const code = randomBytes(4).toString("hex");

  const sr = serviceRoleClient();
  const { error } = await (sr.from("invite_codes") as any).insert({
    code,
    owner_user_id: null,
    label,
    max_uses: maxUses,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/invite-codes");
  return { code };
}

// Admin: soft-revoke a code. Does not undo existing uses.
export async function adminRevokeInviteCode(
  code: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const sr = serviceRoleClient();
  const { error } = await (sr.from("invite_codes") as any)
    .update({ revoked: true })
    .eq("code", code);

  if (error) return { error: error.message };
  revalidatePath("/admin/invite-codes");
  return {};
}
