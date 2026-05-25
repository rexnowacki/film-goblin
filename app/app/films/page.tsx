import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getFilms, type FilmsSort } from "@/lib/queries/films";
import { getMyProfile } from "@/lib/queries/profiles";
import TopNav from "@/components/nav/TopNav";
import BottomNav from "@/components/nav/BottomNav";
import FilmPoster from "@/components/FilmPoster";
import FilmsSearch from "@/components/FilmsSearch";
import PosterQuickAdd from "@/components/PosterQuickAdd";
import FilmsSortChips from "./FilmsSortChips";
import FilmsEmptyState from "@/components/FilmsEmptyState";
import Link from "next/link";
import { compactCount } from "@/lib/format";

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
  const user = await getServerUser();
  const supabase = await createClient();
  const [{ rows: films, total, pageSize }, myProfile] = await Promise.all([
    getFilms(supabase, { q, sort, page, viewerUserId: user?.id ?? null }),
    user ? getMyProfile(supabase) : Promise.resolve(null),
  ]);
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
      <BottomNav current="films" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            Watch <em style={{ color: "var(--accent)" }}>Weirder</em>.
          </h1>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          <FilmsSearch />
          <FilmsSortChips currentSort={sort} currentQ={q} />
          <div style={{ marginBottom: 20, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>
            {total} {total === 1 ? "film" : "films"}{q ? ` matching "${q}"` : ""}
          </div>

          {films.length === 0 ? (
            <FilmsEmptyState query={q} isSignedIn={!!user} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--grid-gap)" }}>
              {films.map(f => (
                <Link key={f.id} href={`/film/${f.id}`} style={{ cursor: "pointer", textDecoration: "none", color: "inherit" }}>
                  {user ? (
                    <PosterQuickAdd
                      filmId={f.id}
                      initialOnWatchlist={f.on_watchlist}
                      initialInLibrary={f.in_library}
                      filmTitle={f.title}
                      filmYear={f.year}
                      sharerUsername={myProfile?.username ?? null}
                    >
                      <FilmPoster film={f as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                    </PosterQuickAdd>
                  ) : (
                    <FilmPoster film={f as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                  )}
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
                          · {compactCount(f.watchlist_count)} on watchlists
                        </span>
                      ) : null}
                      {f.in_library ? (
                        <span style={{ marginLeft: 6, color: "var(--accent)" }}>· In grimoire</span>
                      ) : f.on_watchlist ? (
                        <span style={{ marginLeft: 6, color: "var(--accent)" }}>· On watchlist</span>
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
