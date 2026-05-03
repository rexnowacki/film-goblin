import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export class NotAdminError extends Error {
  constructor() {
    super("admin role required");
    this.name = "NotAdminError";
  }
}

export type AdminAccessResult = "ok" | "not-authed" | "not-admin";

/**
 * Returns a discriminated result for use in redirect/decision logic
 * (layouts, middleware). For server actions use `requireAdmin` below,
 * which throws on any non-"ok" result.
 */
export async function checkAdminAccess(supabase: SupabaseClient<Database>): Promise<AdminAccessResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "not-authed";
  const { data, error } = await supabase
    .from("staff")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return "not-authed";
  if (!data || data.role !== "admin") return "not-admin";
  return "ok";
}

/**
 * Throws NotAdminError unless the caller is authenticated AND has
 * staff.role = 'admin'. Use at the top of every admin server action.
 */
export async function requireAdmin(supabase: SupabaseClient<Database>): Promise<void> {
  const result = await checkAdminAccess(supabase);
  if (result !== "ok") throw new NotAdminError();
}

/**
 * Like requireAdmin, but returns the authenticated User object so the caller
 * can use user.id without a second `supabase.auth.getUser()` round-trip.
 * Throws NotAdminError on any non-admin or non-authed result.
 *
 * Use this in admin server actions that need created_by / user_id alongside
 * the admin gate.
 */
export async function requireAdminUser(supabase: SupabaseClient<Database>): Promise<User> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new NotAdminError();
  const { data, error } = await supabase
    .from("staff")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data || data.role !== "admin") throw new NotAdminError();
  return user;
}
