import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyWatchlistWithFilms } from "@/lib/queries/watchlists";
import { sortWatchlist, computeDropPct, type WatchlistSort } from "@/lib/queries/sort-watchlist";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FilmPoster from "@/components/FilmPoster";
import PosterDropBadge from "@/components/PosterDropBadge";
import WatchlistSortChips from "./WatchlistSortChips";

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

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const supabase = await createClient();
  const { sort: sortParam } = await searchParams;
  const sort: WatchlistSort =
    sortParam && (VALID_SORTS as readonly string[]).includes(sortParam)
      ? (sortParam as WatchlistSort)
      : "drop";

  const rows = await getMyWatchlistWithFilms(supabase);
  const sorted = sortWatchlist(rows, sort);

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

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          {rows.length === 0 ? (
            <WatchlistEmpty />
          ) : (
            <>
              <WatchlistSortChips currentSort={sort} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--grid-gap)" }}>
                {sorted.map(r => {
                  const dropPct = computeDropPct(r);
                  return (
                    <div key={r.id} className="watchlist-card">
                      <Link href={`/film/${r.film.id}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                        <div style={{ position: "relative" }}>
                          <FilmPoster film={r.film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                          <PosterDropBadge dropPct={dropPct} />
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <div className="head" style={{ fontSize: 16, lineHeight: 1.1 }}>{r.film.title}</div>
                          <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                            {r.film.year}
                            {r.film.director ? <span> · {r.film.director}</span> : null}
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
