import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Service-role Supabase client. Bypasses RLS.
 *
 * IMPORTANT: only call this from server-side code (server actions, route
 * handlers, server components). It reads SUPABASE_SERVICE_ROLE_KEY which is a
 * server-only env var. Any "use client" file that imports this module is a bug
 * — the key must never ship to the browser.
 *
 * Call this ONLY after `requireAdmin()` has succeeded. The client has
 * database god-mode.
 */
export function serviceRoleClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (required for admin operations)");
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
