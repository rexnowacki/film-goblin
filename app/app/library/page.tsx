import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLibrary } from "@/lib/queries/library";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FilmPoster from "@/components/FilmPoster";

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?next=/library");

  const rows = await getLibrary(supabase, user.id);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="library" />
      <BottomNav current="library" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            Your <em style={{ color: "var(--accent)" }}>Library</em>.
          </h1>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          {rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
              Empty stacks. Mark films as owned from any film&rsquo;s page.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 20, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>
                {rows.length} {rows.length === 1 ? "film" : "films"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--grid-gap)" }}>
                {rows.map(r => (
                  <Link key={r.film.id} href={`/film/${r.film.id}`} style={{ cursor: "pointer", textDecoration: "none", color: "inherit" }}>
                    <FilmPoster film={r.film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                    <div style={{ marginTop: 10 }}>
                      <div className="head" style={{ fontSize: 16, lineHeight: 1.1 }}>{r.film.title}</div>
                      <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                        {r.film.year}
                        {r.film.director ? <span> &middot; {r.film.director}</span> : null}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
