import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getForYouShelves } from "@/lib/queries/fyp/forYou";
import type { FilmsSort } from "@/lib/queries/films";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import DiscoverTabs from "./DiscoverTabs";
import BrowseAll from "./BrowseAll";
import ForYouShelves from "@/components/ForYouShelves";

const VALID_SORTS: FilmsSort[] = ["added", "release", "title", "watchlisted", "price_low", "price_high"];
function parseSort(raw: string | undefined): FilmsSort {
  return VALID_SORTS.includes(raw as FilmsSort) ? (raw as FilmsSort) : "added";
}

export default async function FilmsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const user = await getServerUser();

  // Browse whenever any browse-flavored param is present — this keeps all
  // existing sort/search/pagination links working without a tab param.
  const browse = !user || sp.tab === "browse" || sp.q != null || sp.sort != null || sp.page != null;

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="films" />
      <BottomNav current="films" />

      {browse ? (
        <section className="discover-browse-masthead">
          <div className="container-wide discover-browse-masthead__inner">
            <div className="eyebrow">The complete archive</div>
            <h1>Watch <em>Weirder</em>.</h1>
            <p>Every film the pit has swallowed. Search the shelves, sort the bones, and take something home.</p>
          </div>
        </section>
      ) : (
        <section className="fyp-masthead">
          <div className="container-wide fyp-masthead__inner">
            <div className="eyebrow">Personal divination</div>
            <h1>The pit <em>remembers</em>.</h1>
            <p>Drawn from the traces you leave behind. A fresh reading waits each day.</p>
          </div>
        </section>
      )}

      <section className={browse ? "discover-content" : "discover-content fyp-content"}>
        <div className="container-wide">
          {user && <DiscoverTabs active={browse ? "browse" : "for-you"} />}
          {browse ? (
            <BrowseAll q={sp.q ?? ""} sort={parseSort(sp.sort)} page={Math.max(1, Number(sp.page ?? 1))} user={user} />
          ) : (
            <ForYouSection userId={user!.id} />
          )}
        </div>
      </section>
    </div>
  );
}

async function ForYouSection({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [shelvesResult, watchlistRes, libraryRes, profileRes] = await Promise.all([
    getForYouShelves(supabase, userId),
    supabase.from("watchlists").select("film_id").eq("user_id", userId),
    supabase.from("library").select("film_id").eq("user_id", userId),
    supabase.from("profiles").select("username").eq("id", userId).maybeSingle(),
  ]);
  const { omen, shelves, filmsById } = shelvesResult;
  return (
    <ForYouShelves
      omen={omen}
      shelves={shelves}
      filmsEntries={Array.from(filmsById.entries())}
      watchlistIds={(watchlistRes.data ?? []).map((r) => r.film_id)}
      libraryIds={(libraryRes.data ?? []).map((r) => r.film_id)}
      sharerUsername={profileRes.data?.username ?? null}
    />
  );
}
