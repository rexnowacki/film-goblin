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
