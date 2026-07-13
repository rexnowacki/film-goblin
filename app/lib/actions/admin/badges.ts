"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { requireAdminUser } from "@/lib/auth/require-admin";
import type { Database } from "@/lib/supabase/types";
import {
  validateBadgeDefinition,
  type BadgeDefinitionInput,
} from "@/lib/badges/definition";

type Client = SupabaseClient<Database>;

export type CreateBadgeResult =
  | { ok: true; badgeId: string; awardedCount: number | null }
  | { ok: false; error: string };

export type ReevaluateBadgesResult =
  | { ok: true; awardedCount: number }
  | { ok: false; error: string };

export async function _createBadge(
  client: Client,
  createdBy: string,
  input: BadgeDefinitionInput,
  storageOrigin: string,
): Promise<CreateBadgeResult> {
  const validationError = validateBadgeDefinition(input, storageOrigin);
  if (validationError) return { ok: false, error: validationError };

  const { data, error } = await client
    .from("badges")
    .insert({
      name: input.name.trim(),
      slug: input.slug.trim(),
      description: input.description.trim(),
      image_url: input.imageUrl,
      condition_kind: input.conditionKind,
      threshold: input.threshold,
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: "A badge already uses that slug or active condition." };
    }
    return { ok: false, error: error?.message ?? "Failed to create badge." };
  }

  const awardResult = await client
    .from("user_badges")
    .select("badge_id", { count: "exact", head: true })
    .eq("badge_id", data.id);

  return {
    ok: true,
    badgeId: data.id,
    awardedCount: awardResult.error || awardResult.count == null ? null : awardResult.count,
  };
}

export async function _reevaluateBadges(client: Client): Promise<ReevaluateBadgesResult> {
  const { data, error } = await client.rpc("evaluate_badges_for_all_users", {
    p_badge_id: null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, awardedCount: data ?? 0 };
}

export async function adminCreateBadge(input: BadgeDefinitionInput): Promise<CreateBadgeResult> {
  const supabase = await createClient();
  const admin = await requireAdminUser(supabase);
  const result = await _createBadge(
    serviceRoleClient(),
    admin.id,
    input,
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  );

  if (result.ok) {
    revalidatePath("/admin/badges");
    revalidatePath("/p/[username]", "page");
  }
  return result;
}

export async function adminReevaluateBadges(): Promise<ReevaluateBadgesResult> {
  const supabase = await createClient();
  await requireAdminUser(supabase);
  const result = await _reevaluateBadges(serviceRoleClient());

  if (result.ok) {
    revalidatePath("/admin/badges");
    revalidatePath("/p/[username]", "page");
  }
  return result;
}
