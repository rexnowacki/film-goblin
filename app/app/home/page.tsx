import { createClient } from "@/lib/supabase/server";
import { getEnrichedFeed } from "@/lib/queries/activity";
import TopNav from "@/components/TopNav";
import FeedTabs from "@/components/FeedTabs";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const feed = user ? await getEnrichedFeed(supabase, user.id, 50) : [];

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="home" />

      <div className="container-wide stackable" style={{ padding: "32px 0", "--stack-template": "220px 1fr 320px", "--stack-gap": "32px" } as React.CSSProperties}>
        <aside className="desktop-only">
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>Your Ledger</div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13 }}>
            Your watchlist and deals summary land here in a later sub-project.
          </div>
        </aside>
        <main>
          <h2 className="h-display" style={{ marginBottom: 16 }}>The Feed</h2>
          <FeedTabs items={feed} />
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
