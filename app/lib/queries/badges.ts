import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

type PublicBadgeDefinition = {
  id: string;
  slug: string;
  name: string;
  description: string;
  image_url: string;
};

type ProfileBadgeRow = {
  badge_id: string;
  awarded_at: string;
  badge: PublicBadgeDefinition | PublicBadgeDefinition[] | null;
};

export interface ProfileBadge extends PublicBadgeDefinition {
  awarded_at: string;
}

const PROFILE_BADGE_SELECT =
  "badge_id, awarded_at, badge:badges!inner(id, slug, name, description, image_url)" as const;

export async function getProfileBadges(client: Client, userId: string): Promise<ProfileBadge[]> {
  const { data, error } = await client
    .from("user_badges")
    .select(PROFILE_BADGE_SELECT)
    .eq("user_id", userId)
    .eq("badge.is_active", true)
    .order("awarded_at", { ascending: false })
    .order("badge_id", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as ProfileBadgeRow[])
    .flatMap((row) => {
      const badge = Array.isArray(row.badge) ? row.badge[0] : row.badge;
      return badge ? [{ ...badge, awarded_at: row.awarded_at }] : [];
    })
    .sort(
      (a, b) =>
        b.awarded_at.localeCompare(a.awarded_at) ||
        a.slug.localeCompare(b.slug) ||
        a.id.localeCompare(b.id),
    );
}
