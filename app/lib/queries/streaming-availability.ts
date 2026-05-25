import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { tmdbProviderLogoUrl, type TmdbWatchProviderCategory } from "@/lib/search/tmdb";

type Client = SupabaseClient<Database>;

export interface FilmWatchProvider {
  id: string;
  film_id: string;
  region: string;
  provider_id: number;
  provider_name: string;
  provider_logo_path: string | null;
  provider_logo_url: string | null;
  category: TmdbWatchProviderCategory;
  display_priority: number;
  tmdb_link: string | null;
}

const CATEGORY_ORDER: TmdbWatchProviderCategory[] = ["flatrate", "free", "ads", "rent", "buy"];
const STREAMING_CATEGORY_ALLOWLIST: readonly TmdbWatchProviderCategory[] = ["flatrate", "free", "ads"];
const FEATURED_STREAMING_PROVIDER_IDS = [
  8, // Netflix
  9, // Amazon Prime Video
  15, // Hulu
  73, // Tubi TV
  350, // Apple TV+
  1899, // HBO Max / Max
  1796, // Netflix Standard with Ads
  1825, // HBO Max Amazon Channel
  2100, // Amazon Prime Video with Ads
  613, // Amazon Prime Video Free with Ads
] as const;

function categoryRank(category: TmdbWatchProviderCategory): number {
  const rank = CATEGORY_ORDER.indexOf(category);
  return rank === -1 ? CATEGORY_ORDER.length : rank;
}

export async function getFilmWatchProviders(
  client: Client,
  filmId: string,
  region = "US",
): Promise<FilmWatchProvider[]> {
  const typedClient = client as unknown as { from: (table: string) => any };
  const { data, error } = await typedClient
    .from("film_watch_providers")
    .select("id, film_id, region, provider_id, provider_name, provider_logo_path, category, display_priority, tmdb_link")
    .eq("film_id", filmId)
    .eq("region", region.toUpperCase())
    .in("provider_id", [...FEATURED_STREAMING_PROVIDER_IDS])
    .in("category", [...STREAMING_CATEGORY_ALLOWLIST]);
  if (error) throw error;

  return ((data ?? []) as Array<Omit<FilmWatchProvider, "provider_logo_url">>)
    .map((row) => ({
      ...row,
      category: row.category as TmdbWatchProviderCategory,
      provider_logo_url: tmdbProviderLogoUrl(row.provider_logo_path),
    }))
    .sort((a, b) => {
      const categoryDiff = categoryRank(a.category) - categoryRank(b.category);
      if (categoryDiff !== 0) return categoryDiff;
      return a.display_priority - b.display_priority;
    });
}
