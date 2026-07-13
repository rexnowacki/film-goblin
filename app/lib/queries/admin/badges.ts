import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { BadgeConditionKind } from "@/lib/badges/definition";

type Client = SupabaseClient<Database>;

export interface AdminBadgeRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string;
  conditionKind: BadgeConditionKind;
  threshold: number;
  isActive: boolean;
  createdAt: string;
  awardCount: number;
}

export async function getAdminBadgeRows(client: Client): Promise<AdminBadgeRow[]> {
  const definitions = await client
    .from("badges")
    .select("id, slug, name, description, image_url, condition_kind, threshold, is_active, created_at")
    .order("created_at", { ascending: true });

  if (definitions.error) throw definitions.error;

  // Exact HEAD counts cannot be truncated by PostgREST's response row limit.
  // The definition registry is intentionally small, so one bounded count per
  // badge is preferable to fetching every award row into the app process.
  const counts = await Promise.all(
    (definitions.data ?? []).map(async (definition) => {
      const result = await client
        .from("user_badges")
        .select("badge_id", { count: "exact", head: true })
        .eq("badge_id", definition.id);
      if (result.error) throw result.error;
      return result.count ?? 0;
    }),
  );

  return (definitions.data ?? []).map((definition, index) => ({
    id: definition.id,
    slug: definition.slug,
    name: definition.name,
    description: definition.description,
    imageUrl: definition.image_url,
    conditionKind: definition.condition_kind,
    threshold: definition.threshold,
    isActive: definition.is_active,
    createdAt: definition.created_at,
    awardCount: counts[index],
  }));
}
