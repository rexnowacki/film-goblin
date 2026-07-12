import { createClient } from "@/lib/supabase/server";
import { getServerUser, getActiveRitualPick } from "@/lib/supabase/cached";
import { getEnrichedActivity } from "@/lib/queries/activity";
import { getWatchlistPriceDropFilms } from "@/lib/queries/ledger";
import type { GoblinPickFilm } from "@/lib/queries/goblin-pick";
import { getRitualMessages } from "@/lib/queries/ritual";
import { getPitArchiveEvents, getRecentSystemEvents } from "@/lib/feed-events/query";
import { PIT_ARCHIVE_PAGE_SIZE } from "@/lib/feed-events/pitArchive";
import { getEligiblePitEventsForUser } from "@/lib/feed-events/pitSelection";
import LedgerPanel from "@/components/LedgerPanel";
import GoblinRecommends from "@/components/GoblinRecommends";
import GoblinRecommendsMobile from "@/components/GoblinRecommendsMobile";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FeedTabs from "@/components/FeedTabs";
import FeedSearch from "@/components/FeedSearch";
import NextInThePit from "@/components/return-contract/NextInThePit";
import { getReturnContracts } from "@/lib/queries/return-contract";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 20;
type FeedTab = "all" | "coven" | "recs" | "pit";

const VALID_TABS = new Set<FeedTab>(["all", "coven", "recs", "pit"]);

const TAB_KINDS: Partial<Record<FeedTab, string[]>> = {
  recs: ["recommendation_sent"],
  pit: [],
};

const TAB_SCOPE: Record<FeedTab, "site" | "coven"> = {
  all: "site",
  coven: "coven",
  recs: "coven",
  pit: "site",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; film?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const actorId = sp.actor && UUID_RE.test(sp.actor) ? sp.actor : null;
  const filmId = sp.film && UUID_RE.test(sp.film) ? sp.film : null;
  const tabParam = VALID_TABS.has(sp.tab as FeedTab) ? (sp.tab as FeedTab) : "all";
  // One instant owns both queue deadlines and UTC-day progress so a request
  // crossing midnight cannot resolve one day and persist under another.
  const now = new Date();
  const dateSeed = now.toISOString().slice(0, 10);
  const user = await getServerUser();
  const supabase = await createClient();

  const initialPagePromise = user && tabParam !== "pit"
    ? getEnrichedActivity(supabase, user.id, {
        limit: PAGE_SIZE,
        actorId: actorId ?? undefined,
        filmId: filmId ?? undefined,
        kinds: TAB_KINDS[tabParam],
        scope: TAB_SCOPE[tabParam],
      })
    : Promise.resolve({ items: [], nextCursor: null, done: true });
  const returnContractsPromise = user
    ? getReturnContracts(supabase, user.id, now)
    : Promise.resolve([]);
  const pitArchivePromise = user && tabParam === "pit"
    ? getPitArchiveEvents(supabase, { limit: PIT_ARCHIVE_PAGE_SIZE })
    : Promise.resolve(undefined);
  const priceDropFilmsPromise = user
    ? getWatchlistPriceDropFilms(supabase, user.id, 5)
    : Promise.resolve([]);
  const ritualPickPromise = getActiveRitualPick();
  const ritualMessagesPromise = ritualPickPromise.then(ritualPick =>
    user && ritualPick ? getRitualMessages(supabase, ritualPick.pick_id) : [],
  );
  const systemEventsPromise = tabParam === "pit"
    ? Promise.resolve([])
    : user ? getEligiblePitEventsForUser(supabase, user.id, 12) : getRecentSystemEvents(supabase, 12);
  const viewerPromise = user
    ? supabase.from("profiles")
        .select("id, username, avatar_url, display_name")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => data)
    : Promise.resolve(null);
  const staffRowPromise = user
    ? supabase.from("staff")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => data)
    : Promise.resolve(null);

  const [initialPage, returnContracts, pitArchive, priceDropFilms, ritualPick, systemEvents, ritualMessages, viewer, staffRow] =
    await Promise.all([
      initialPagePromise,
      returnContractsPromise,
      pitArchivePromise,
      priceDropFilmsPromise,
      ritualPickPromise,
      systemEventsPromise,
      ritualMessagesPromise,
      viewerPromise,
      staffRowPromise,
    ]);
  const initialItems = initialPage.items;
  const initialCursor = initialPage.nextCursor;
  const initialDone = initialPage.done;

  const goblinPick: GoblinPickFilm | null = ritualPick
    ? { ...ritualPick.film, whisper_text: ritualPick.whisper_text }
    : null;
  const ritual = {
    pick: ritualPick,
    initialMessages: ritualMessages,
    currentUserId: user?.id ?? null,
    viewerUsername: viewer?.username ?? null,
    viewerAvatarUrl: viewer?.avatar_url ?? null,
    viewerDisplayName: viewer?.display_name ?? null,
    viewerIsAdmin: staffRow?.role === "admin",
  };

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
    <div className="home-feed-shell">
      <TopNav current="home" />
      <BottomNav current="home" />

      <section className="home-feed-masthead grain-dark">
        <div className="container-wide home-feed-masthead__inner">
          <div>
            <div className="eyebrow">Live transmissions from your coven</div>
            <h1>The <em>Feed</em></h1>
          </div>
          <p>Watches, hoards, recommendations, and strange movements from the Pit.</p>
        </div>
      </section>

      <div className="container-wide stackable home-feed-layout" style={{ "--stack-template": "220px minmax(0, 1fr) 320px", "--stack-gap": "32px" } as React.CSSProperties}>
        <aside
          className="desktop-only home-feed-rail home-feed-rail--left"
        >
          {user ? (
            <LedgerPanel films={priceDropFilms} />
          ) : (
            <div className="home-feed-signin-note">
              <div className="eyebrow">Your Ledger</div>
              <p>
                Sign in to see price drops on your watchlist.
              </p>
            </div>
          )}
        </aside>
        <main className="home-feed-main">
          {returnContracts.length > 0 && user && (
            <NextInThePit contracts={returnContracts} viewerId={user.id} utcDay={dateSeed} />
          )}
          {user && <FeedSearch active={active} />}
          <FeedTabs
            initialItems={initialItems}
            initialCursor={initialCursor}
            initialDone={initialDone}
            filters={{ actorId: actorId ?? undefined, filmId: filmId ?? undefined }}
            systemEvents={actorId || filmId ? undefined : systemEvents}
            dateSeed={dateSeed}
            pitArchive={pitArchive}
          >
            <GoblinRecommendsMobile film={goblinPick} ritual={ritual} />
          </FeedTabs>
        </main>
        <aside
          className="desktop-only home-feed-rail home-feed-rail--right"
        >
          <GoblinRecommends film={goblinPick} ritual={ritual} />
        </aside>
      </div>
    </div>
  );
}
