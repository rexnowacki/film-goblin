import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FilmPoster from "@/components/FilmPoster";

export default async function TagPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: encoded } = await params;
  const tagName = decodeURIComponent(encoded);
  const supabase = await createClient();

  const { data: tag } = await supabase.from("tags").select("id, name, type").eq("name", tagName).maybeSingle();
  if (!tag) notFound();

  const { data: filmTags } = await supabase
    .from("film_tags")
    .select("film:films!inner(id, title, year, director, artwork_url, available)")
    .eq("tag_id", tag.id)
    .lte("position", 4);

  const { data: stats } = await supabase
    .from("films_with_stats")
    .select("id, coven_rating_pct, coven_rating_count");

  const ratingById = new Map((stats ?? []).map(s => [s.id, s]));
  const films = (filmTags ?? [])
    .map(r => (r as unknown as { film: { id: string; title: string; year: number; director: string; artwork_url: string; available: boolean } }).film)
    .filter(f => f.available)
    .map(f => ({ ...f, rating: ratingById.get(f.id) }))
    .sort((a, b) => {
      const ar = a.rating?.coven_rating_pct ?? -1;
      const br = b.rating?.coven_rating_pct ?? -1;
      if (ar !== br) return br - ar;
      return b.year - a.year;
    });

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="films" />
      <BottomNav current="films" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)", textTransform: "capitalize" }}>
            {tag.name}.
          </h1>
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, color: "var(--void)", opacity: 0.7, margin: "8px 0 0" }}>
            {films.length} films tagged {tag.name}{films.some(f => f.rating?.coven_rating_pct != null) ? ", ranked by your coven's verdict" : ""}.
          </p>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          {films.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
              No films tagged {tag.name} yet.
            </div>
          ) : (
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
          )}
        </div>
      </section>
    </div>
  );
}
