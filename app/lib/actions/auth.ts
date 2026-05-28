"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/auth/friendly-errors";
import { safeRedirect } from "@/lib/auth/safe-redirect";
import { setInviteCookie } from "./invite-cookie";
import { peekInviteCode, burnInviteCode } from "@/lib/actions/invite-codes";
import { readInviteCodeCookie } from "@/lib/actions/invite-cookie";
import { isInviteGateEnabled } from "@/lib/actions/admin/site-settings";

const USERNAME_RE = /^[a-z0-9._]+$/;
const SYNTHETIC_EMAIL_DOMAIN = "noreply.film-goblin.app";

function syntheticEmailFor(username: string): string {
  return `${username}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export async function signIn(formData: FormData): Promise<{ error?: string }> {
  const identifier = String(formData.get("identifier") || formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const redirectIn = String(formData.get("redirect") || "/home");
  const target = safeRedirect(redirectIn);

  if (!identifier) return { error: "Enter your username or email." };

  let email = identifier;
  if (!identifier.includes("@")) {
    if (!USERNAME_RE.test(identifier)) {
      return { error: "Invalid credentials." };
    }
    const admin = serviceRoleClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", identifier)
      .maybeSingle();
    if (!profile) return { error: "Invalid credentials." };
    const { data: user, error: lookupErr } = await admin.auth.admin.getUserById(profile.id);
    if (lookupErr || !user?.user?.email) return { error: "Invalid credentials." };
    email = user.user.email;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: friendlyError(error) };
  redirect(target);
}

export async function signUp(formData: FormData): Promise<{ error?: string; info?: string; duplicate?: boolean }> {
  const password = String(formData.get("password") || "");
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const redirectIn = String(formData.get("redirect") || "/home");
  const target = safeRedirect(redirectIn);
  const invite = String(formData.get("invite") || "").trim().toLowerCase();

  if (!USERNAME_RE.test(username) || username.length > 24) {
    return { error: "Username: lowercase letters, numbers, dots, underscores only (max 24)." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  // Gate check — validate cookie before touching auth.users. The gate is a
  // runtime DB setting (site_settings.invite_gate); read once and reuse below
  // so a mid-request toggle can't make the two checks disagree.
  const gateEnabled = await isInviteGateEnabled();
  let inviteCode: string | null = null;
  if (gateEnabled) {
    inviteCode = await readInviteCodeCookie();
    const isValid = await peekInviteCode(inviteCode);
    if (!isValid) return { error: "You need a valid invite link to join." };
  }

  const admin = serviceRoleClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .limit(1);
  if (existing && existing.length > 0) {
    return { error: "That username is already taken." };
  }

  const email = syntheticEmailFor(username);
  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createErr) {
    const duplicate = createErr.message?.toLowerCase().includes("already") ?? false;
    return { error: friendlyError(createErr), duplicate };
  }

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    return { error: friendlyError(signInErr) };
  }

  // Burn invite after user is created — newUserId is now known
  if (gateEnabled && inviteCode && createData?.user?.id) {
    await burnInviteCode(inviteCode, createData.user.id);
  }

  if (invite) {
    try {
      await setInviteCookie(invite);
    } catch { /* cookie failure must never break signup */ }
  }
  redirect(target);
}

export type UsernameCheckStatus = "ok" | "taken" | "invalid";

export async function checkUsernameAvailability(
  usernameRaw: string,
): Promise<{ status: UsernameCheckStatus }> {
  const username = String(usernameRaw || "").trim().toLowerCase();
  if (!username || username.length > 24 || !USERNAME_RE.test(username)) {
    return { status: "invalid" };
  }
  const admin = serviceRoleClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .limit(1);
  return { status: existing && existing.length > 0 ? "taken" : "ok" };
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

// Called from /auth/change-password after admin used adminForcePasswordChange.
// Updates the password (the user is already signed in with the temp one) and
// clears profiles.must_change_password so middleware lets them out.
export async function completeForcedPasswordChange(
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const newPassword = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (newPassword.length < 6) return { error: "Password must be at least 6 characters." };
  if (newPassword !== confirm) return { error: "Passwords don't match." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error: passErr } = await supabase.auth.updateUser({ password: newPassword });
  if (passErr) return { error: friendlyError(passErr) };

  const sr = serviceRoleClient();
  const { error: flagErr } = await sr
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);
  if (flagErr) return { error: flagErr.message };

  return { ok: true };
}

export async function deleteAccount(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const sr = serviceRoleClient();
  const { error } = await sr.auth.admin.deleteUser(user.id);
  if (error) return { error: error.message };
  await supabase.auth.signOut().catch(() => {});
  redirect("/");
}
