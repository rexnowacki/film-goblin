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
import BuyOnAppleLink from "@/components/BuyOnAppleLink";

const VALID_SORTS: readonly WatchlistSort[] = ["drop", "recency", "price-low", "alphabetical"] as const;

function WatchlistEmpty() {
  return (
    <div className="collection-empty">
      <div className="collection-empty__mark" aria-hidden="true">◇</div>
      <div className="eyebrow">Nothing stashed</div>
      <h2>The hoard is hungry.</h2>
      <p>Mark a film for later and it will wait here—along with every price drop the pit sniffs out.</p>
      <a href="/films" className="btn btn-lg">
        Find something strange →
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
    <div className="collection-page collection-page--hoard">
      <TopNav current="watchlist" />
      <BottomNav current="watchlist" />

      <section className="collection-hero">
        <div className="container-wide collection-hero__inner">
          <div className="collection-hero__copy">
            <div className="eyebrow">Things wanted · prices watched</div>
            <h1>The <em>Hoard</em>.</h1>
            <p>Every film you mean to drag home. The pit keeps one eye on the price while you wait.</p>
          </div>
          <div className="collection-hero__tally" aria-label={`${rows.length} films in your hoard`}>
            <strong>{rows.length}</strong>
            <span>{rows.length === 1 ? "film waiting" : "films waiting"}</span>
          </div>
        </div>
      </section>

      <section className="collection-content">
        <div className="container-wide">
          {rows.length === 0 ? (
            <WatchlistEmpty />
          ) : (
            <>
              <div className="collection-tools">
                <WatchlistSearch />
                <div className="collection-tools__sort">
                  <div className="eyebrow">Order the pile</div>
                  <WatchlistSortChips currentSort={sort} />
                </div>
              </div>
              {sorted.length === 0 && q && (
                <div className="collection-no-results">
                  Nothing in the hoard answers that name.
                </div>
              )}
              <div className="collection-grid">
                {sorted.map(r => {
                  const dropPct = computeDropPct(r);
                  return (
                    <div key={r.id} className="watchlist-card collection-card">
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
                        <div className="collection-card__caption">
                          <div className="collection-card__title">{r.film.title}</div>
                          <div className="collection-card__meta">
                            {r.film.year}
                            {r.film.director ? <span> · {r.film.director}</span> : null}
                            {r.film.currently_showing ? <span style={{ color: "var(--accent)" }}> · In theaters</span> : null}
                          </div>
                        </div>
                      </Link>
                      {r.film.itunes_url && (
                        <BuyOnAppleLink
                          filmId={r.film.id}
                          title={r.film.title}
                          price={r.film.latest_price}
                          href={r.film.itunes_url}
                          signedIn
                          className="caps"
                          style={{ display: "inline-block", fontSize: 10, color: "var(--accent)", marginTop: 4, textDecoration: "none" }}
                        >
                          Apple TV{r.film.latest_price != null ? ` · $${r.film.latest_price.toFixed(2)}` : ""} →
                        </BuyOnAppleLink>
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
