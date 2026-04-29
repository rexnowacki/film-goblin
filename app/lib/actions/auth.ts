"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/auth/friendly-errors";
import { safeRedirect } from "@/lib/auth/safe-redirect";

const HANDLE_RE = /^[a-z0-9._]+$/;

export async function signIn(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const redirectIn = String(formData.get("redirect") || "/home");
  const target = safeRedirect(redirectIn);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: friendlyError(error) };
  redirect(target);
}

export async function signUp(formData: FormData): Promise<{ error?: string; info?: string; duplicate?: boolean }> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const displayName = String(formData.get("display_name") || "").trim();
  const handle = String(formData.get("handle") || "").trim();
  const origin = String(formData.get("origin") || "");
  const redirectIn = String(formData.get("redirect") || "/home");
  const target = safeRedirect(redirectIn);

  if (displayName.length < 1 || displayName.length > 40) {
    return { error: "Display name must be 1–40 characters." };
  }
  if (!HANDLE_RE.test(handle) || handle.length > 24) {
    return { error: "Handle: lowercase letters, numbers, dots, underscores only (max 24)." };
  }

  const admin = serviceRoleClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("handle", handle)
    .limit(1);
  if (existing && existing.length > 0) {
    return { error: "That handle is already taken." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { handle, display_name: displayName },
      emailRedirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(target)}`,
    },
  });
  if (error) {
    const friendly = friendlyError(error);
    const duplicate = error.message === "User already registered";
    return { error: friendly, duplicate };
  }
  return { info: "Check your email to confirm your account." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function signInWithGoogle(nextPath?: string): Promise<{ url: string }> {
  const origin = process.env.APP_BASE_URL || "http://localhost:3000";
  const next = safeRedirect(nextPath ?? null);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data?.url) throw new Error(friendlyError(error ?? "OAuth provider unreachable"));
  return { url: data.url };
}

export async function sendPasswordReset(formData: FormData): Promise<{ message: string }> {
  const email = String(formData.get("email") || "").trim();
  const origin = String(formData.get("origin") || "");
  if (!email) return { message: "Enter your email." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset`,
  });
  // Don't leak whether the email exists (no email-enumeration).
  return { message: "If an account with that email exists, we've sent a reset link. Check your inbox." };
}

export async function resetPassword(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const newPassword = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (newPassword.length < 6) return { error: "Password must be at least 6 characters." };
  if (newPassword !== confirm) return { error: "Passwords don't match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: friendlyError(error) };
  return { ok: true };
}
