import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyWatchlistWithFilms } from "@/lib/queries/watchlists";
import { sortWatchlist, computeDropPct, type WatchlistSort } from "@/lib/queries/sort-watchlist";
import { getMyProfile } from "@/lib/queries/profiles";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FilmPoster from "@/components/FilmPoster";
import PosterDropBadge from "@/components/PosterDropBadge";
import PosterMobileActions from "@/components/PosterMobileActions";
import WatchlistSortChips from "./WatchlistSortChips";
import WatchlistSearch from "@/components/WatchlistSearch";

const VALID_SORTS: readonly WatchlistSort[] = ["drop", "recency", "price-low", "alphabetical"] as const;

function WatchlistEmpty() {
  return (
    <div className="watchlist-empty">
      <h2 className="display" style={{ fontSize: "clamp(36px, 6vw, 64px)", margin: "0 0 16px", lineHeight: 0.95 }}>
        The Scroll is empty.
      </h2>
      <p style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontStyle: "italic", opacity: 0.75, margin: "0 0 28px" }}>
        No films tracked. Yet.
      </p>
      <a href="/films" className="btn btn-lg">
        Browse the archive →
      </a>
    </div>
  );
}

function matchesQuery(film: { title: string; director: string; year: number }, q: string): boolean {
  const needle = q.toLowerCase();
  return (
    film.title.toLowerCase().includes(needle) ||
    (film.director ?? "").toLowerCase().includes(needle) ||
    String(film.year).includes(needle)
  );
}

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; q?: string }>;
}) {
  const supabase = await createClient();
  const { sort: sortParam, q: rawQ } = await searchParams;
  const sort: WatchlistSort =
    sortParam && (VALID_SORTS as readonly string[]).includes(sortParam)
      ? (sortParam as WatchlistSort)
      : "drop";
  const q = (rawQ ?? "").trim();

  const [rows, myProfile] = await Promise.all([
    getMyWatchlistWithFilms(supabase),
    getMyProfile(supabase),
  ]);
  const sorted = q
    ? sortWatchlist(rows, sort).filter(r => matchesQuery(r.film, q))
    : sortWatchlist(rows, sort);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="watchlist" />
      <BottomNav current="watchlist" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            The <em style={{ color: "var(--accent)" }}>Scroll</em>.
          </h1>
        </div>
      </section>

      <section style={{ padding: "16px 0 calc(80px + env(safe-area-inset-bottom))" }}>
        <div className="container-wide">
          {rows.length === 0 ? (
            <WatchlistEmpty />
          ) : (
            <>
              <WatchlistSearch />
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8, marginTop: 12 }}>Sort by</div>
              <WatchlistSortChips currentSort={sort} />
              {sorted.length === 0 && q && (
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", padding: "20px 0" }}>
                  No films match.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--grid-gap)" }}>
                {sorted.map(r => {
                  const dropPct = computeDropPct(r);
                  return (
                    <div key={r.id} className="watchlist-card">
                      <Link prefetch={false} href={`/film/${r.film.id}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                        <div style={{ position: "relative" }}>
                          <FilmPoster film={r.film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                          <PosterDropBadge dropPct={dropPct} />
                          <PosterMobileActions
                            kind="watchlist"
                            filmId={r.film.id}
                            filmTitle={r.film.title}
                            filmYear={r.film.year}
                            sharerUsername={myProfile?.username ?? null}
                            currentlyShowing={r.film.currently_showing}
                          />
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <div className="head" style={{ fontSize: 16, lineHeight: 1.1 }}>{r.film.title}</div>
                          <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.film.year}
                            {r.film.director ? <span> · {r.film.director}</span> : null}
                            {r.film.currently_showing ? <span style={{ color: "var(--accent)" }}> · In theaters</span> : null}
                          </div>
                        </div>
                      </Link>
                      {r.film.itunes_url && (
                        <a
                          href={r.film.itunes_url}
                          target="_blank"
                          rel="noreferrer"
                          className="caps"
                          style={{ display: "inline-block", fontSize: 10, color: "var(--accent)", marginTop: 4, textDecoration: "none" }}
                        >
                          Apple TV{r.film.latest_price != null ? ` · $${r.film.latest_price.toFixed(2)}` : ""} →
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
