import { createClient } from "@/lib/supabase/server";
import { getPublicLists, getMySubscribedLists } from "@/lib/queries/lists";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import SubscribeButton from "@/components/SubscribeButton";

export default async function ListsPage() {
  const supabase = await createClient();
  const lists = await getPublicLists(supabase);
  const { data: { user } } = await supabase.auth.getUser();
  const mySubs = user ? new Set(await getMySubscribedLists(supabase, user.id)) : new Set<string>();

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="lists" />
      <BottomNav current="lists" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "48px 0 32px" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Chapter III · The Grimoires</div>
          <h1 className="h-display">
            Curated<br /><em style={{ color: "var(--accent)" }}>Lists</em>
          </h1>
        </div>
      </section>

      <section style={{ padding: "36px 0 60px" }}>
        <div className="container-wide">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--grid-gap)" }}>
            {lists.map((l) => (
              <div key={l.id} style={{ border: "2px solid var(--bone)", padding: 20 }}>
                {l.is_official && (
                  <span className="stamp" style={{ background: "var(--accent)", color: "var(--accent-ink)", marginBottom: 12, display: "inline-block" }}>
                    ✦ Official
                  </span>
                )}
                <div className="head" style={{ fontSize: 22, lineHeight: 1.1, marginBottom: 12 }}>{l.title}</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, marginBottom: 16, opacity: 0.8 }}>
                  {l.description || "\u00A0"}
                </div>
                {user ? (
                  <SubscribeButton listId={l.id} initialSubscribed={mySubs.has(l.id)} />
                ) : (
                  <div className="caps" style={{ fontSize: 10, opacity: 0.6 }}>Sign in to subscribe</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
