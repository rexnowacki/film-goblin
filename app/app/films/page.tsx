import { createClient } from "@/lib/supabase/server";
import { getFilms } from "@/lib/queries/films";
import TopNav from "@/components/TopNav";
import FilmPoster from "@/components/FilmPoster";
import FilmsSearch from "@/components/FilmsSearch";
import Link from "next/link";

export default async function FilmsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const films = await getFilms(supabase, { q });

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="films" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "44px 0 32px" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Chapter II · The Archive</div>
          <h1 className="display" style={{ fontSize: 112, margin: 0, lineHeight: 0.88 }}>
            Every Film, <em style={{ color: "var(--accent)" }}>Indexed</em>.
          </h1>
          <div style={{ display: "flex", gap: 0, border: "3px solid var(--void)", background: "var(--bone)", boxShadow: "6px 6px 0 var(--accent)", marginTop: 24 }}>
            <span style={{ padding: "16px 18px", fontFamily: "var(--font-display)", fontSize: 28, color: "var(--accent)", lineHeight: 1 }}>✦</span>
            <FilmsSearch />
          </div>
        </div>
      </section>

      <section style={{ padding: "36px 0 60px" }}>
        <div className="container-wide">
          {films.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
              No films match. The void returned nothing.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--grid-gap)" }}>
              {films.map(f => (
                <Link key={f.id} href={`/film/${f.id}`} style={{ cursor: "pointer", textDecoration: "none", color: "inherit" }}>
                  <FilmPoster film={f as any} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                  <div style={{ marginTop: 10 }}>
                    <div className="head" style={{ fontSize: 16, lineHeight: 1.1 }}>{f.title}</div>
                    <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{f.year}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
