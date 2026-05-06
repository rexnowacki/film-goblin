import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import type { DbFilm } from "./films-step-logic";
import type { StarterProfile } from "./CovenStep";
// OnboardingWizard created in the next task
import OnboardingWizard from "./OnboardingWizard";

const FLAVOR_TAG_NAMES = [
  "folk horror",
  "giallo",
  "witchcraft",
  "body horror",
  "cosmic horror",
  "religious horror",
  "arthouse",
  "midnight movie",
] as const;

export default async function OnboardingPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?next=/onboarding");
  const supabase = await createClient();

  // Look up tag UUIDs for the 8 flavor cards
  const { data: tagRows } = await supabase
    .from("tags")
    .select("id, name")
    .in("name", FLAVOR_TAG_NAMES as unknown as string[]);
  const laneTagMap: Record<string, string> = {};
  for (const t of tagRows ?? []) laneTagMap[t.name] = t.id;
  const flavorTagIds = Object.values(laneTagMap);

  // Fetch editorial_starter films and flavor-tagged films separately, then merge
  const [starterFilmsRes, taggedFilmsRes, profileRes, startersRes] = await Promise.all([
    supabase
      .from("films")
      .select("id, itunes_id, title, director, year, genre_primary, artwork_url, editorial_starter, film_tags(tag_id)")
      .eq("editorial_starter", true)
      .eq("available", true)
      .limit(96),
    flavorTagIds.length > 0
      ? supabase
          .from("film_tags")
          .select("film_id, tag_id, film:films!inner(id, itunes_id, title, director, year, genre_primary, artwork_url, editorial_starter, film_tags(tag_id))")
          .in("tag_id", flavorTagIds)
          .limit(96)
      : Promise.resolve({ data: [] as any[], error: null }),
    supabase.from("profiles").select("username").eq("id", user.id).single(),
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("is_starter", true)
      .order("starter_order", { ascending: true, nullsLast: true } as any)
      .limit(20),
  ]);

  // Merge + deduplicate films into DbFilm shape
  const filmMap = new Map<string, DbFilm>();
  for (const f of starterFilmsRes.data ?? []) {
    filmMap.set(f.id, {
      id: f.id,
      itunes_id: f.itunes_id,
      title: f.title,
      director: f.director,
      year: f.year,
      genre_primary: f.genre_primary,
      artwork_url: f.artwork_url,
      editorial_starter: f.editorial_starter,
      tagIds: ((f.film_tags ?? []) as Array<{ tag_id: string }>).map(t => t.tag_id),
    });
  }
  for (const row of taggedFilmsRes.data ?? []) {
    const f = (row as any).film;
    if (!f || filmMap.has(f.id)) continue;
    filmMap.set(f.id, {
      id: f.id,
      itunes_id: f.itunes_id,
      title: f.title,
      director: f.director,
      year: f.year,
      genre_primary: f.genre_primary,
      artwork_url: f.artwork_url,
      editorial_starter: f.editorial_starter,
      tagIds: ((f.film_tags ?? []) as Array<{ tag_id: string }>).map(t => t.tag_id),
    });
  }

  const films = Array.from(filmMap.values());
  const starters = (startersRes.data ?? []) as StarterProfile[];
  const initialUsername = profileRes.data?.username ?? "";

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <OnboardingWizard
        initialUsername={initialUsername}
        films={films}
        starters={starters}
        laneTagMap={laneTagMap}
      />
    </div>
  );
}
