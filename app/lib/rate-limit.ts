import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
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

export function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function parseClientIp(xForwardedFor: string | null, xRealIp: string | null): string {
  const first = xForwardedFor?.split(",")[0]?.trim();
  if (first) return first;
  const real = xRealIp?.trim();
  if (real) return real;
  return "unknown";
}

export async function getClientIpHash(): Promise<string> {
  const h = await headers();
  return hashKey(parseClientIp(h.get("x-forwarded-for"), h.get("x-real-ip")));
}

export function utcQuarterHourBucket(date = new Date()): string {
  const minutes = date.getUTCMinutes();
  const floored = String(minutes - (minutes % 15)).padStart(2, "0");
  return `${date.toISOString().slice(0, 14)}${floored}`;
}

export function utcHourBucket(date = new Date()): string {
  return date.toISOString().slice(0, 13);
}

export async function consumeIpRateLimit(
  client: SupabaseClient<Database>,
  input: { ipHash: string; key: string; limit: number; windowStart: string },
): Promise<RateLimitResult> {
  const { data, error } = await (client as any).rpc("consume_ip_rate_limit", {
    p_ip_hash: input.ipHash,
    p_key: input.key,
    p_limit: input.limit,
    p_window_start: input.windowStart,
  });

  if (error) {
    console.error("consumeIpRateLimit failed (fail-open):", error.message);
    return { allowed: true, count: 0, remaining: input.limit };
  }

  const row = (Array.isArray(data) ? data[0] : data) as Partial<RateLimitResult> | null | undefined;
  return {
    allowed: row?.allowed === true,
    count: Number(row?.count ?? 0),
    remaining: Number(row?.remaining ?? 0),
  };
}
