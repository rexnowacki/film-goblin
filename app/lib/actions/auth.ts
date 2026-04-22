"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signIn(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/home");
}

export async function signUp(formData: FormData): Promise<{ error?: string; info?: string }> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const origin = String(formData.get("origin") || "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/api/auth/callback` },
  });
  if (error) return { error: error.message };
  return { info: "Check your email to confirm your account." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
