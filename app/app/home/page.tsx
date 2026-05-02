import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getEnrichedActivity } from "@/lib/queries/activity";
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

  const initialItems = user
    ? await getEnrichedActivity(supabase, user.id, {
        limit: PAGE_SIZE,
        actorId: actorId ?? undefined,
        filmId: filmId ?? undefined,
      })
    : [];
  const initialCursor = initialItems.length > 0 ? initialItems[initialItems.length - 1].created_at : null;
  const initialDone = initialItems.length < PAGE_SIZE;

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

      <div className="container-wide stackable" style={{ padding: "32px var(--container-pad)", "--stack-template": "220px 1fr 320px", "--stack-gap": "32px" } as React.CSSProperties}>
        <aside className="desktop-only">
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>Your Ledger</div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13 }}>
            Your watchlist and deals summary land here in a later sub-project.
          </div>
        </aside>
        <main>
          {user && <FeedSearch active={active} />}
          <FeedTabs
            initialItems={initialItems}
            initialCursor={initialCursor}
            initialDone={initialDone}
            filters={{ actorId: actorId ?? undefined, filmId: filmId ?? undefined }}
          />
        </main>
        <aside className="desktop-only">
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>Popular Grimoires</div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13 }}>
            Lives in a later sub-project.
          </div>
        </aside>
      </div>
    </div>
  );
}
