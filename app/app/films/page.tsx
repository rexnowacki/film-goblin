import { createClient } from "@/lib/supabase/server";
import { getFilms, type FilmsSort } from "@/lib/queries/films";
import TopNav from "@/components/TopNav";
import FilmPoster from "@/components/FilmPoster";
import FilmsSearch from "@/components/FilmsSearch";
import FilmsSortChips from "./FilmsSortChips";
import Link from "next/link";

const VALID_SORTS: FilmsSort[] = ["added", "release", "title", "watchlisted", "price_low", "price_high"];

function parseSort(raw: string | undefined): FilmsSort {
  return VALID_SORTS.includes(raw as FilmsSort) ? (raw as FilmsSort) : "added";
}

export default async function FilmsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const sort = parseSort(sp.sort);
  const page = Math.max(1, Number(sp.page ?? 1));
  const supabase = await createClient();
  const { rows: films, total, pageSize } = await getFilms(supabase, { q, sort, page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sort !== "added") params.set("sort", sort);
    if (p !== 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/films?${s}` : "/films";
  }

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="films" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            Every Film, <em style={{ color: "var(--accent)" }}>Indexed</em>.
          </h1>
          <div style={{ display: "flex", gap: 0, border: "1px solid var(--muted)", background: "var(--bone)", boxShadow: "6px 6px 0 var(--accent)", marginTop: 16 }}>
            <span style={{ padding: "14px 16px", color: "var(--accent-deep)", lineHeight: 1, display: "inline-flex", alignItems: "center" }} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.5" y2="16.5" />
              </svg>
            </span>
            <FilmsSearch />
          </div>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          <FilmsSortChips currentSort={sort} currentQ={q} />
          <div style={{ marginBottom: 20, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>
            {total} {total === 1 ? "film" : "films"}{q ? ` matching "${q}"` : ""}
          </div>

          {films.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
              No films match. The void returned nothing.
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
                      {(sort === "release" || sort === "added") && f.director ? (
                        <span> · {f.director}</span>
                      ) : null}
                      {sort === "price_low" || sort === "price_high" ? (
                        <span style={{ marginLeft: 6, color: "var(--accent)" }}>
                          {f.latest_price != null ? `· $${Number(f.latest_price).toFixed(2)}` : ""}
                        </span>
                      ) : null}
                      {sort === "watchlisted" ? (
                        <span style={{ marginLeft: 6, color: "var(--accent)" }}>
                          · {f.watchlist_count} on watchlists
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 40, alignItems: "center" }}>
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="btn btn-sm btn-outline">← Prev</Link>
              ) : (
                <span style={{ opacity: 0.3, fontSize: 11, padding: "8px 14px" }} className="caps">← Prev</span>
              )}
              <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={pageHref(page + 1)} className="btn btn-sm btn-outline">Next →</Link>
              ) : (
                <span style={{ opacity: 0.3, fontSize: 11, padding: "8px 14px" }} className="caps">Next →</span>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
