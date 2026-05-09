import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FilmPoster from "@/components/FilmPoster";
import { groupAndSortBySeries } from "@/lib/series-order";

export default async function DirectorPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: encoded } = await params;
  const directorName = decodeURIComponent(encoded).trim();
  if (!directorName) notFound();

  const supabase = await createClient();

  const { data: filmRows } = await supabase
    .from("films")
    .select("id, title, year, director, artwork_url, available")
    .ilike("director", directorName)
    .eq("available", true);

  if (!filmRows || filmRows.length === 0) notFound();

  const { data: stats } = await supabase
    .from("films_with_stats")
    .select("id, coven_rating_pct, coven_rating_count")
    .in("id", filmRows.map(f => f.id));

  const ratingById = new Map((stats ?? []).map(s => [s.id, s]));
  const enriched = filmRows.map(f => ({ ...f, rating: ratingById.get(f.id) }));
  // Chronological director filmography with series clumped: anchor each
  // series-or-standalone group by its first entry's year ascending.
  const films = groupAndSortBySeries(enriched, (a, b) => (a.year ?? 0) - (b.year ?? 0));
  const canonicalName = filmRows[0].director ?? directorName;

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="films" />
      <BottomNav current="films" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ fontSize: 11, marginBottom: 6, color: "var(--accent-deep)" }}>Director</div>
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)", margin: 0 }}>
            {canonicalName}.
          </h1>
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, color: "var(--void)", opacity: 0.7, margin: "8px 0 0" }}>
            {films.length} {films.length === 1 ? "film" : "films"} in the catalog, in chronological order.
          </p>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--grid-gap)" }}>
            {films.map(f => (
              <Link key={f.id} href={`/film/${f.id}`} style={{ cursor: "pointer", textDecoration: "none", color: "inherit" }}>
                <FilmPoster film={f as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                <div style={{ marginTop: 10 }}>
                  <div className="head" style={{ fontSize: 16, lineHeight: 1.1 }}>{f.title}</div>
                  <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                    {f.year}
                    {f.rating?.coven_rating_pct != null && f.rating?.coven_rating_count != null && f.rating.coven_rating_count >= 5 ? (
                      <span style={{ marginLeft: 6, color: "var(--accent)" }}>· {Math.round(f.rating.coven_rating_pct)}%</span>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
