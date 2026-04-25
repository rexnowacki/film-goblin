import { createClient } from "@/lib/supabase/server";
import { getMyWatchlistWithFilms } from "@/lib/queries/watchlists";
import { sortWatchlist, type WatchlistSort } from "@/lib/queries/sort-watchlist";
import TopNav from "@/components/TopNav";
import WatchlistRow from "./WatchlistRow";
import WatchlistSortSelect from "./WatchlistSortSelect";

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
      <TopNav />
      <section style={{ padding: "48px 0" }}>
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>
            Films you're tracking
          </div>
          <h1
            className="display"
            style={{
              fontSize: "clamp(48px, 8vw, 96px)",
              margin: "0 0 32px",
              lineHeight: 0.9,
            }}
          >
            The Scroll
          </h1>
          {rows.length === 0 ? (
            <WatchlistEmpty />
          ) : (
            <>
              <div className="watchlist-toolbar">
                <span className="caps" style={{ opacity: 0.7 }}>
                  {rows.length} tracked
                </span>
                <WatchlistSortSelect current={sort} />
              </div>
              <div className="watchlist-list">
                {sorted.map(r => (
                  <WatchlistRow key={r.id} row={r} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
