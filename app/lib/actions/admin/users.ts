"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export interface CreateTestUserFields {
  email: string;
  password: string;
  display_name: string;
}

export async function generatePassword(): Promise<string> {
  return randomBytes(12).toString("base64url");
}

function validEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

export async function adminCreateTestUser(fields: CreateTestUserFields): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  if (!validEmail(fields.email)) return { ok: false, error: "Invalid email." };
  if (fields.password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const sr = serviceRoleClient();
  const { data, error } = await sr.auth.admin.createUser({
    email: fields.email,
    password: fields.password,
    email_confirm: true,
    user_metadata: { created_by_admin: true, display_name: fields.display_name || null },
  });
  if (error || !data.user) return { ok: false, error: error?.message ?? "createUser failed" };

  // The profiles row is created by the auth→profile trigger; update display_name if provided.
  if (fields.display_name.trim()) {
    await sr.from("profiles").update({ display_name: fields.display_name.trim() }).eq("id", data.user.id);
  }

  revalidatePath("/admin/users");
  return { ok: true, userId: data.user.id };
}

export async function adminDeleteUser(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const sr = serviceRoleClient();
  const { error } = await sr.auth.admin.deleteUser(id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export type UserRole = "goblin" | "witch" | "high_goblin";

const VALID_ROLES: UserRole[] = ["goblin", "witch", "high_goblin"];

export async function adminSetUserRole(
  userId: string,
  role: UserRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  if (!VALID_ROLES.includes(role)) return { ok: false, error: "Invalid role." };

  const sr = serviceRoleClient();

  const { error: updateErr } = await sr.from("profiles").update({ role }).eq("id", userId);
  if (updateErr) return { ok: false, error: updateErr.message };

  // Witch <-> staff invariant: promoting to witch grants admin staff;
  // demoting from witch revokes it. Settled in the same call so the
  // two can't drift via the admin UI.
  if (role === "witch") {
    const { error: staffErr } = await sr
      .from("staff")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id" });
    if (staffErr) return { ok: false, error: staffErr.message };
  } else {
    const { error: staffDelErr } = await sr.from("staff").delete().eq("user_id", userId);
    if (staffDelErr) return { ok: false, error: staffDelErr.message };
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}
