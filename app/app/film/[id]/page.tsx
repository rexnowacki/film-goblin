import { createClient } from "@/lib/supabase/server";
import { getFilm, getLatestPriceHistory } from "@/lib/queries/films";
import { isOnWatchlist } from "@/lib/queries/watchlists";
import { isInLibrary } from "@/lib/queries/library";
import { getWatchCountForFilm } from "@/lib/queries/watched";
import { getPublishedReviewsForFilm } from "@/lib/queries/reviews";
import { getMyCovenMembers } from "@/lib/queries/coven";
import FilmPoster from "@/components/FilmPoster";
import Stars from "@/components/Stars";
import TopNav from "@/components/TopNav";
import FilmActions from "@/components/FilmActions";
import RecommendModal from "@/components/RecommendModal";
import PriceStatBlock from "@/components/PriceStatBlock";

export default async function FilmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const film = await getFilm(supabase, id);
  const history = await getLatestPriceHistory(supabase, id, 180);
  const reviews = await getPublishedReviewsForFilm(supabase, id);
  const { data: { user } } = await supabase.auth.getUser();
  const covenMembers = user ? await getMyCovenMembers(supabase, user.id) : [];
  const onList = user ? await isOnWatchlist(supabase, id) : false;
  const owned = user ? await isInLibrary(supabase, user.id, id) : false;
  const watchCount = user ? await getWatchCountForFilm(supabase, user.id, id) : 0;

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav />

      <section style={{
        background: "var(--void-2)", color: "var(--bone)",
        borderBottom: "3px solid var(--void)",
        position: "relative", overflow: "hidden",
      }}>
        <div className="container-wide stackable" style={{ padding: "48px 0", "--stack-template": "340px 1fr", "--stack-gap": "48px", alignItems: "start" } as React.CSSProperties}>
          <div style={{
            transform: "rotate(-2deg)",
            width: "100%",
            maxWidth: "var(--film-hero-poster-size)",
            margin: "0 auto",
          }}>
            <FilmPoster
              film={film as any}
              size="xl"
              style={{ width: "100%", height: "auto", aspectRatio: "2 / 3" }}
            />
          </div>
          <div className="film-hero-text">
            <div className="eyebrow" style={{ marginBottom: 10, opacity: 0.8 }}>
              {film.genre_primary}
            </div>
            <h1 className="head" style={{ fontSize: "clamp(40px, 10vw, 96px)", margin: 0, lineHeight: 0.92 }}>
              {film.title}
            </h1>
            <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap" }} className="caps caps-row">
              <span>Dir. {film.director}</span>
              <span>·</span>
              <span>{film.year}</span>
              <span>·</span>
              <span>{film.runtime_min} min</span>
            </div>
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", lineHeight: 1.35, margin: "28px 0", maxWidth: 620 }}>
              "{film.description}"
            </p>
            <div className="hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              {user && <FilmActions filmId={film.id} filmTitle={film.title} initialOnWatchlist={onList} initialOwned={owned} initialWatchCount={watchCount} />}
              {user && <RecommendModal filmId={film.id} filmTitle={film.title} covenMembers={covenMembers.map(m => ({ id: m.id, handle: m.handle, display_name: m.display_name }))} />}
              {film.itunes_url && (
                <a href={film.itunes_url} target="_blank" rel="noreferrer" className="btn btn-lg">
                  Buy on Apple TV →
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--bone)", color: "var(--void)", padding: "48px 0", borderBottom: "3px solid var(--void)" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>The Price Scroll · 180 Days</div>
          <h3 className="display" style={{ fontSize: 44, margin: "0 0 20px", lineHeight: 0.9 }}>
            What it <em style={{ color: "var(--accent)", fontStyle: "italic" }}>has been worth</em>.
          </h3>
          {history.length > 0 ? (
            <PriceStatBlock history={history} />
          ) : (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
              No price history yet. Check back after the first worker run.
            </div>
          )}
        </div>
      </section>

      <section style={{ background: "var(--void)", color: "var(--bone)", padding: "48px 0" }}>
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 14 }}>Editorial Reviews</div>
          {reviews.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
              No reviews yet.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {reviews.map(r => (
                <article key={r.id} style={{ background: "var(--void-2)", border: "1px solid #333", padding: 22 }}>
                  <h3 className="head" style={{ fontSize: 24, marginBottom: 8 }}>{r.title}</h3>
                  <p style={{ fontFamily: "var(--font-serif)", fontSize: 15, lineHeight: 1.55 }}>{r.body}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
