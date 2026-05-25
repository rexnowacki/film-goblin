"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { friendlyError } from "@/lib/auth/friendly-errors";
import { requireAuthUser } from "@/lib/auth/require-auth-user";

type Client = SupabaseClient<Database>;

export interface ProfileFields {
  username?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  broadcast_watchlist_adds?: boolean;
  broadcast_library?: boolean;
  broadcast_watched?: boolean;
  email_price_drops?: boolean;
  email_coven_recs?: boolean;
  email_comments?: boolean;
  email_coven_invites?: boolean;
  notify_rate_reminders?: boolean;
  notify_comment_likes?: boolean;
  notify_film_requests?: boolean;
  discoverable?: boolean;
}

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

const USERNAME_RE = /^[a-z0-9._]+$/;
const USERNAME_MAX_LENGTH = 24;

export async function _updateProfile(client: Client, fields: ProfileFields): Promise<void> {
  const user = await requireAuthUser(client);

  if (fields.username !== undefined) {
    const u = fields.username.trim().toLowerCase();
    if (!u || u.length > USERNAME_MAX_LENGTH || !USERNAME_RE.test(u)) {
      throw new Error("Invalid username: lowercase letters, numbers, dots, underscores only (max 24).");
    }
    fields = { ...fields, username: u };
  }

  const patch: ProfileUpdate = { ...fields };
  const reEnablingAnyKind =
    fields.email_price_drops === true ||
    fields.email_coven_recs === true ||
    fields.email_comments === true ||
    fields.email_coven_invites === true;
  if (reEnablingAnyKind) {
    const { data: current } = await client
      .from("profiles")
      .select("email_price_drops, email_coven_recs, email_comments, email_coven_invites")
      .eq("id", user.id)
      .single();
    const wasFullyOptedOut =
      current &&
      current.email_price_drops === false &&
      current.email_coven_recs === false &&
      current.email_comments === false &&
      current.email_coven_invites === false;
    if (wasFullyOptedOut) {
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
