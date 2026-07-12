import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getLibrary, getLibrarySavings } from "@/lib/queries/library";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FilmPoster from "@/components/FilmPoster";
import PosterMobileActions from "@/components/PosterMobileActions";
import { getMyProfile } from "@/lib/queries/profiles";

export default async function LibraryPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?next=/library");
  const supabase = await createClient();

  const [rows, myProfile, savings] = await Promise.all([
    getLibrary(supabase, user.id),
    getMyProfile(supabase),
    getLibrarySavings(supabase, user.id),
  ]);

  return (
    <div className="collection-page collection-page--grimoire">
      <TopNav current="library" />
      <BottomNav current="library" />

      <section className="collection-hero">
        <div className="container-wide collection-hero__inner">
          <div className="collection-hero__copy">
            <div className="eyebrow">The films you claimed</div>
            <h1>Your <em>Grimoire</em>.</h1>
            <p>The shelf is yours. Every disc, download, and strange little treasure you dragged back from the dark.</p>
          </div>
          <div className="collection-hero__tally" aria-label={`${rows.length} films in your grimoire`}>
            <strong>{rows.length}</strong>
            <span>{rows.length === 1 ? "film claimed" : "films claimed"}</span>
          </div>
        </div>
      </section>

      <section className="collection-content">
        <div className="container-wide">
          {savings.claimedCount > 0 && (
            <div className="collection-ledger" aria-label="Grimoire savings">
              <div className="collection-ledger__heading">
                <span className="eyebrow">The claiming ledger</span>
                <strong>What the goblin kept</strong>
              </div>
              <div className="collection-ledger__stat">
                <span>Prices recorded</span>
                <strong>{savings.claimedCount}</strong>
              </div>
              <div className="collection-ledger__stat">
                <span>Tithed to Apple</span>
                <strong>${savings.totalPaid.toFixed(2)}</strong>
              </div>
              <div className="collection-ledger__stat collection-ledger__stat--accent">
                <span>Kept from the fire</span>
                <strong>${savings.totalSaved.toFixed(2)}</strong>
              </div>
            </div>
          )}
          {rows.length === 0 ? (
            <div className="collection-empty">
              <div className="collection-empty__mark" aria-hidden="true">◉</div>
              <div className="eyebrow">No relics on the shelf</div>
              <h2>The pages are bare.</h2>
              <p>Claim a film from its page and the grimoire will begin remembering what belongs to you.</p>
              <Link href="/films" className="btn btn-lg">Browse the archive →</Link>
            </div>
          ) : (
            <>
              <div className="collection-section-heading">
                <span className="eyebrow">On your shelf</span>
                <span>{rows.length} {rows.length === 1 ? "film" : "films"}</span>
              </div>
              <div className="collection-grid">
                {rows.map(r => (
                  <Link key={r.film.id} href={`/film/${r.film.id}`} className="collection-card">
                    <div style={{ position: "relative" }}>
                      <FilmPoster film={r.film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                      <PosterMobileActions
                        kind="library"
                        filmId={r.film.id}
                        filmTitle={r.film.title}
                        filmYear={r.film.year}
                        sharerUsername={myProfile?.username ?? null}
                      />
                    </div>
                    <div className="collection-card__caption">
                      <div className="collection-card__title">{r.film.title}</div>
                      <div className="collection-card__meta">
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
