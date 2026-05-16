import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
}

export function utcDayString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function consumeRateLimit(
  client: SupabaseClient<Database>,
  input: { userId: string; key: string; limit: number; windowStart?: string },
): Promise<RateLimitResult> {
  const { data, error } = await (client as any).rpc("consume_app_rate_limit", {
    p_user_id: input.userId,
    p_key: input.key,
    p_limit: input.limit,
    p_window_start: input.windowStart ?? utcDayString(),
  });

  if (error) {
    console.error("consumeRateLimit failed:", error.message);
    return { allowed: false, count: input.limit, remaining: 0 };
  }

  const row = (Array.isArray(data) ? data[0] : data) as Partial<RateLimitResult> | null | undefined;
  return {
    allowed: row?.allowed === true,
    count: Number(row?.count ?? 0),
    remaining: Number(row?.remaining ?? 0),
  };
}
