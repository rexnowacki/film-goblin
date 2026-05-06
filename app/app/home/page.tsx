import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getEnrichedActivity } from "@/lib/queries/activity";
import { getFollowedActivity } from "@/lib/queries/followed-activity";
import { getWatchlistPriceDropFilms } from "@/lib/queries/ledger";
import { getGoblinPick } from "@/lib/queries/goblin-pick";
import FollowedActivityFeed from "@/components/FollowedActivityFeed";
import LedgerPanel from "@/components/LedgerPanel";
import GoblinRecommends from "@/components/GoblinRecommends";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FeedTabs from "@/components/FeedTabs";
import FeedSearch from "@/components/FeedSearch";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 20;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; film?: string }>;
}) {
  const sp = await searchParams;
  const actorId = sp.actor && UUID_RE.test(sp.actor) ? sp.actor : null;
  const filmId = sp.film && UUID_RE.test(sp.film) ? sp.film : null;
  const user = await getServerUser();
  const supabase = await createClient();

  const initialPage = user
    ? await getEnrichedActivity(supabase, user.id, {
        limit: PAGE_SIZE,
        actorId: actorId ?? undefined,
        filmId: filmId ?? undefined,
      })
    : { items: [], nextCursor: null, done: true };
  const initialItems = initialPage.items;
  const initialCursor = initialPage.nextCursor;
  const initialDone = initialPage.done;

  const followedActivity = user ? await getFollowedActivity(supabase, user.id) : [];
  const [priceDropFilms, goblinPick] = await Promise.all([
    user ? getWatchlistPriceDropFilms(supabase, user.id) : Promise.resolve([]),
    getGoblinPick(supabase),
  ]);

  // Resolve the active filter's display data so the chip can render.
  let active: React.ComponentProps<typeof FeedSearch>["active"] = null;
  if (actorId) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .eq("id", actorId)
      .maybeSingle();
    if (data) active = { kind: "actor", id: data.id, label: data.username, avatar_url: data.avatar_url };
  } else if (filmId) {
    const { data } = await supabase
      .from("films")
      .select("id, title, artwork_url")
      .eq("id", filmId)
      .maybeSingle();
    if (data) active = { kind: "film", id: data.id, label: data.title, artwork_url: data.artwork_url };
  }

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="home" />
      <BottomNav current="home" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            The <em style={{ color: "var(--accent)" }}>Feed</em>.
          </h1>
        </div>
      </section>

      <div className="container-wide stackable" style={{ padding: "32px var(--container-pad)", "--stack-template": "220px 1fr 320px", "--stack-gap": "32px", alignItems: "start" } as React.CSSProperties}>
        <aside
          className="desktop-only"
          style={{ position: "sticky", top: "calc(46px + env(safe-area-inset-top))", maxHeight: "calc(100vh - 46px - env(safe-area-inset-top))", overflowY: "auto", paddingBottom: 32 }}
        >
          {user ? (
            <LedgerPanel films={priceDropFilms} />
          ) : (
            <div>
              <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>Your Ledger</div>
              <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)" }}>
                Sign in to see price drops on your watchlist.
              </p>
            </div>
          )}
        </aside>
        <main>
          {user && <FeedSearch active={active} />}
          <FeedTabs
            initialItems={initialItems}
            initialCursor={initialCursor}
            initialDone={initialDone}
            filters={{ actorId: actorId ?? undefined, filmId: filmId ?? undefined }}
          />
          {followedActivity.length > 0 && (
            <section style={{ marginTop: 48, paddingBottom: 48 }}>
              <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 14 }}>
                From the Goblins
              </div>
              <FollowedActivityFeed items={followedActivity} />
            </section>
          )}
        </main>
        <aside
          className="desktop-only"
          style={{ position: "sticky", top: "calc(46px + env(safe-area-inset-top))", maxHeight: "calc(100vh - 46px - env(safe-area-inset-top))", overflowY: "auto", paddingBottom: 32 }}
        >
          <GoblinRecommends film={goblinPick} />
        </aside>
      </div>
    </div>
  );
}
