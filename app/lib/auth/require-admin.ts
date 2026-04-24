import type { SupabaseClient } from "@supabase/supabase-js";
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
