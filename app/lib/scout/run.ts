// Weekly Release Scout job. Queues new horror releases into film_requests
// (source='scout') for owner approval. The lock is taken by the caller
// (maintenance wrapper or the manual job runner), never here.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { discoverHorrorReleases } from "@/lib/search/tmdb";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { pickScoutReleases, type ScoutPick, type ScoutWindow, type TmdbDiscoverResult } from "@/lib/scout/pick";

export interface ScoutDeps {
  discover(window: ScoutWindow, today: string): Promise<
    { ok: true; results: TmdbDiscoverResult[] } | { ok: false; error: string }
  >;
  loadKnownTmdbIds(): Promise<Set<number>>;
  insertPick(pick: ScoutPick): Promise<"inserted" | "duplicate">;
}

export interface ScoutStats {
  fetchedDigital: number;
  fetchedTheatrical: number;
  kept: number;
  inserted: number;
  skippedKnown: number;
}

export async function runReleaseScout(deps: ScoutDeps, now: Date): Promise<ScoutStats> {
  const today = now.toISOString().slice(0, 10);
  const [digital, theatrical] = await Promise.all([
    deps.discover("digital", today),
    deps.discover("theatrical", today),
  ]);
  if (!digital.ok) throw new Error(`digital: ${digital.error}`);
  if (!theatrical.ok) throw new Error(`theatrical: ${theatrical.error}`);

  const known = await deps.loadKnownTmdbIds();
  const picks = pickScoutReleases({
    digital: digital.results,
    theatrical: theatrical.results,
    today,
    knownTmdbIds: known,
  });

  const uniqueFetched = new Set([...digital.results, ...theatrical.results].map(r => r.id));
  let skippedKnown = [...uniqueFetched].filter(id => known.has(id)).length;
  let inserted = 0;
  for (const pick of picks) {
    if ((await deps.insertPick(pick)) === "inserted") inserted++;
    else skippedKnown++;
  }

  return {
    fetchedDigital: digital.results.length,
    fetchedTheatrical: theatrical.results.length,
    kept: picks.length,
    inserted,
    skippedKnown,
  };
}

const PAGE_SIZE = 1000;

type IdPage = PromiseLike<{ data: { tmdb_id: number | null }[] | null; error: { message: string } | null }>;

async function collectTmdbIds(
  label: string,
  fetchPage: (from: number, to: number) => IdPage,
  into: Set<number>,
): Promise<void> {
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label} tmdb_id load failed: ${error.message}`);
    for (const row of data ?? []) if (row.tmdb_id != null) into.add(Number(row.tmdb_id));
    if (!data || data.length < PAGE_SIZE) return;
  }
}

export function supabaseScoutDeps(svc: SupabaseClient<Database>): ScoutDeps {
  return {
    discover: discoverHorrorReleases,
    async loadKnownTmdbIds() {
      const ids = new Set<number>();
      // Literal table names keep supabase-js row typing intact.
      await collectTmdbIds("films", (from, to) =>
        svc.from("films").select("tmdb_id").not("tmdb_id", "is", null).range(from, to), ids);
      await collectTmdbIds("film_requests", (from, to) =>
        svc.from("film_requests").select("tmdb_id").not("tmdb_id", "is", null).range(from, to), ids);
      return ids;
    },
    async insertPick(pick) {
      const { error } = await svc.from("film_requests").insert({
        source: "scout",
        status: "pending",
        needs_itunes_id: true,
        request_count: 0,
        tmdb_id: pick.tmdb_id,
        title: pick.title,
        year: pick.year,
        release_date: pick.release_date,
        scout_window: pick.window,
        artwork_url: pick.artwork_url,
        description: pick.description,
      });
      if (!error) return "inserted";
      if (error.code === "23505") return "duplicate";
      throw new Error(`film_requests insert failed: ${error.message}`);
    },
  };
}

export async function runReleaseScoutWithSvc(
  svc: SupabaseClient<Database> = serviceRoleClient(),
  now: Date = new Date(),
): Promise<ScoutStats> {
  return runReleaseScout(supabaseScoutDeps(svc), now);
}
