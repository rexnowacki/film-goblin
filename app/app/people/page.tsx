import { createClient } from "@/lib/supabase/server";
import { getProfilesBySearch } from "@/lib/queries/profiles";
import TopNav from "@/components/TopNav";
import PeopleSearch from "@/components/PeopleSearch";
import Avatar from "@/components/Avatar";
import Link from "next/link";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const profiles = await getProfilesBySearch(supabase, { q });

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="people" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "44px 0 32px" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Chapter IV · The Covenfolk</div>
          <h1 className="display" style={{ fontSize: 112, margin: 0, lineHeight: 0.88 }}>
            Find Your <em style={{ color: "var(--accent)" }}>People</em>.
          </h1>
          <div style={{ display: "flex", border: "3px solid var(--void)", background: "var(--bone)", boxShadow: "6px 6px 0 var(--accent)", marginTop: 24 }}>
            <span style={{ padding: "16px 18px", fontFamily: "var(--font-display)", fontSize: 28, color: "var(--accent)", lineHeight: 1 }}>✦</span>
            <PeopleSearch />
          </div>
        </div>
      </section>

      <section style={{ padding: "36px 0 60px" }}>
        <div className="container-wide">
          {profiles.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
              No souls match your search.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--grid-gap)" }}>
              {profiles.map(p => (
                <Link key={p.id} href={`/p/${encodeURIComponent(p.handle)}`} style={{ display: "block", textDecoration: "none", color: "inherit", border: "2px solid var(--bone)", padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                    <Avatar name={p.display_name ?? p.handle} color="var(--accent)" size={48} url={p.avatar_url} />
                    <div>
                      <div className="head" style={{ fontSize: 20, lineHeight: 1 }}>{p.display_name ?? p.handle}</div>
                      <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>@{p.handle}</div>
                    </div>
                  </div>
                  {p.bio && <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontStyle: "italic", color: "var(--bone)", opacity: 0.8, marginTop: 8 }}>{p.bio}</div>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
