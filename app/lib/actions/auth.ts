"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/auth/friendly-errors";
import { safeRedirect } from "@/lib/auth/safe-redirect";

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
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const origin = String(formData.get("origin") || "");
  const redirectIn = String(formData.get("redirect") || "/home");
  const target = safeRedirect(redirectIn);
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
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
