"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { friendlyError } from "@/lib/auth/friendly-errors";

type Client = SupabaseClient<Database>;

export interface ProfileFields {
  username?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  broadcast_watchlist_adds?: boolean;
  broadcast_library?: boolean;
  broadcast_watched?: boolean;
  email_notifications_enabled?: boolean;
}

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export async function _updateProfile(client: Client, fields: ProfileFields): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  const patch: ProfileUpdate = { ...fields };
  if (fields.email_notifications_enabled === true) {
    const { data: current } = await client
      .from("profiles")
      .select("email_notifications_enabled")
      .eq("id", user.id)
      .single();
    if (current && current.email_notifications_enabled === false) {
      const { randomUUID } = await import("node:crypto");
      patch.unsubscribe_token = randomUUID();
    }
  }

  const { error } = await client.from("profiles").update(patch).eq("id", user.id);
  if (error) throw error;
}

export async function updateProfile(fields: ProfileFields) {
  const c = await createClient();
  await _updateProfile(c, fields);
  revalidatePath("/settings");
}

export async function updateEmail(formData: FormData): Promise<{ error?: string; ok?: boolean; info?: string }> {
  const newEmail = String(formData.get("email") || "").trim().toLowerCase();
  if (!newEmail || !newEmail.includes("@")) {
    return { error: "Enter a valid email address." };
  }
  if (newEmail.endsWith("@noreply.film-goblin.app")) {
    return { error: "That domain is reserved." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) return { error: friendlyError(error) };
  return {
    ok: true,
    info: "Check the new inbox for a confirmation link. Email isn't active until you click it.",
  };
}

export async function changePassword(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const currentPassword = String(formData.get("current_password") || "");
  const newPassword = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (newPassword.length < 6) return { error: "New password must be at least 6 characters." };
  if (newPassword !== confirm) return { error: "New passwords don't match." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not signed in." };

  // OAuth-only user (no password identity): skip re-auth.
  const hasPasswordIdentity = (user.identities ?? []).some(i => i.provider === "email");
  if (hasPasswordIdentity) {
    const reauth = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (reauth.error) return { error: "Current password is incorrect." };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: friendlyError(error) };
  return { ok: true };
}
