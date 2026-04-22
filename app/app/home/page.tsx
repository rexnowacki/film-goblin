import { createClient } from "@/lib/supabase/server";
import { getFeed } from "@/lib/queries/activity";
import TopNav from "@/components/TopNav";
import FeedTabs from "@/components/FeedTabs";

export default async function HomePage() {
  const supabase = await createClient();
  const feed = await getFeed(supabase, 50);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="home" />

      <div className="container-wide" style={{ padding: 32, display: "grid", gridTemplateColumns: "220px 1fr 320px", gap: 32 }}>
        <aside>
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>Your Ledger</div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13 }}>
            Your watchlist and deals summary land here in a later sub-project.
          </div>
        </aside>
        <main>
          <h2 className="display" style={{ fontSize: 42, margin: "0 0 16px" }}>The Feed</h2>
          <FeedTabs items={feed as any} />
        </main>
        <aside>
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>Popular Grimoires</div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13 }}>
            Lives in a later sub-project.
          </div>
        </aside>
      </div>
    </div>
  );
}
