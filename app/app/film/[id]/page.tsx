import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getFilm, getLatestPriceHistory } from "@/lib/queries/films";
import { isOnWatchlist } from "@/lib/queries/watchlists";
import { isInLibrary } from "@/lib/queries/library";
import { getWatchCountForFilm } from "@/lib/queries/watched";
import { getPublishedReviewsForFilm } from "@/lib/queries/reviews";
import { getMyCovenMembers } from "@/lib/queries/coven";
import { getTopRecommendedCovenMemberIds } from "@/lib/queries/recommendations";
import { getMyProfile } from "@/lib/queries/profiles";
import { getSharerWatchForFilm } from "@/lib/queries/sharer-watch";
import FilmPoster from "@/components/FilmPoster";
import Stars from "@/components/Stars";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FilmActions from "@/components/FilmActions";
import RecommendModal from "@/components/RecommendModal";
import PriceStatBlock from "@/components/PriceStatBlock";
import CovenScore from "@/components/CovenScore";
import FilmTagsRow from "@/components/FilmTagsRow";
import ShareFilmButton from "@/components/ShareFilmButton";
import TrailerButton from "@/components/TrailerButton";
import SharerWatchPin from "@/components/SharerWatchPin";
import FilmCTABanner from "@/components/FilmCTABanner";
import { compactCount } from "@/lib/format";
import { getFilmTags } from "@/lib/queries/film-tags";
import { getCovenWatchersForFilm, getOtherWatchersForFilm } from "@/lib/queries/film-watchers";
import FilmWatchersStrip from "@/components/FilmWatchersStrip";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const film = await getFilm(supabase, id);
  if (!film) return { title: "Film Goblin" };

  const title = `${film.title} (${film.year})`;
  const description = film.description?.trim() || `${film.director}, ${film.year}.`;
  const url = `https://film-goblin.vercel.app/film/${film.id}`;

  const ogImageUrl = `https://film-goblin.vercel.app/api/og/film/${film.id}`;
  const ogImages = [{ url: ogImageUrl, width: 1200, height: 630, alt: film.title }];
  const twitterImages = [ogImageUrl];

  return {
    title: `${title} — Film Goblin`,
    description,
    openGraph: {
      title,
      description,
      images: ogImages,
      type: "video.movie",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: twitterImages,
    },
  };
}

export default async function FilmDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from: fromRaw } = await searchParams;
  const fromUsername = fromRaw && /^[a-z0-9._]+$/.test(fromRaw) ? fromRaw.toLowerCase() : null;

  const supabase = await createClient();
  const [film, history, reviews, user] = await Promise.all([
    getFilm(supabase, id),
    getLatestPriceHistory(supabase, id, 180),
    getPublishedReviewsForFilm(supabase, id),
    getServerUser(),
  ]);
  const [covenMembers, onList, owned, watchCount, topCovenMemberIds, myProfile, covenWatchers, otherWatchersResult] = user
    ? await Promise.all([
        getMyCovenMembers(supabase, user.id),
        isOnWatchlist(supabase, id),
        isInLibrary(supabase, user.id, id),
        getWatchCountForFilm(supabase, user.id, id),
        getTopRecommendedCovenMemberIds(supabase, user.id),
        getMyProfile(supabase),
        getCovenWatchersForFilm(supabase, user.id, id),
        getOtherWatchersForFilm(supabase, user.id, id),
      ])
    : [[], false, false, 0, [] as string[], null, [], { users: [], totalCount: 0 }];

  const sharerWatch = fromUsername ? await getSharerWatchForFilm(fromUsername, id) : null;
  const filmTags = await getFilmTags(supabase, id);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      {!user && <FilmCTABanner fromUsername={fromUsername} />}
      <TopNav current="films" showBack />
      <BottomNav current="films" />

      {/* Bone header band — site-language alignment with /home, /director, /tags. */}
      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ fontSize: 11, marginBottom: 6, color: "var(--accent-deep)" }}>{film.genre_primary || "Film"}</div>
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)", margin: 0, lineHeight: 0.92 }}>
            {film.title}.
          </h1>
          <div style={{ marginTop: 10, fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--void)", opacity: 0.75, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span>{film.year}</span>
            <span aria-hidden="true">·</span>
            <span>
              Dir.{" "}
              {film.director ? (
                <Link prefetch={false} href={`/director/${encodeURIComponent(film.director)}`} style={{ color: "inherit", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}>
                  {film.director}
                </Link>
              ) : "—"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{film.runtime_min} min</span>
            {film.content_advisory && (<>
              <span aria-hidden="true">·</span>
              <span>{film.content_advisory}</span>
            </>)}
          </div>
        </div>
      </section>

      {/* Cinematic hero — oversized poster, description + tags + primary CTA, then a secondary action cluster. */}
      <section style={{ background: "var(--void)", color: "var(--bone)", borderBottom: "3px solid var(--void)" }}>
        <div className="container-wide stackable" style={{ paddingTop: 56, paddingBottom: 56, "--stack-template": "minmax(280px, 420px) 1fr", "--stack-gap": "56px", alignItems: "start" } as React.CSSProperties}>
          <div style={{ width: "100%", maxWidth: 420, margin: "0 auto" }}>
            <FilmPoster
              film={film as never}
              size="xl"
              style={{ width: "100%", height: "auto", aspectRatio: "2 / 3", boxShadow: "10px 10px 0 var(--accent)" }}
              priority
            />
          </div>
          <div className="film-hero-text">
            {sharerWatch && (
              <div style={{ marginBottom: 24 }}>
                <SharerWatchPin watch={sharerWatch} />
              </div>
            )}
            {film.description && (
              <p style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", lineHeight: 1.4, margin: "0 0 28px", maxWidth: 640 }}>
                &ldquo;{film.description}&rdquo;
              </p>
            )}
            <div style={{ marginBottom: 28 }}>
              <FilmTagsRow visible={filmTags.visible} director={film.director} />
            </div>

            {/* Primary action cluster — save/own/log + recommend + share + buy. */}
            <div className="hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {user && <FilmActions filmId={film.id} filmTitle={film.title} initialOnWatchlist={onList} initialOwned={owned} initialWatchCount={watchCount} />}
              {user && <RecommendModal
                filmId={film.id}
                filmTitle={film.title}
                covenMembers={covenMembers.map(m => ({ id: m.id, username: m.username, display_name: m.display_name, avatar_url: m.avatar_url }))}
                topCovenMemberIds={topCovenMemberIds}
              />}
              <ShareFilmButton
                filmId={film.id}
                title={film.title}
                year={film.year}
                sharerUsername={myProfile?.username ?? null}
              />
              {film.itunes_url && (
                <a href={film.itunes_url} target="_blank" rel="noreferrer" className="btn btn-lg">
                  Buy on Apple TV →
                </a>
              )}
            </div>

            {/* Inline trailer — shown after the main film actions when metadata exists. */}
            {film.trailer_youtube_id && (
              <div style={{ marginTop: 28 }}>
                <TrailerButton
                  youtubeId={film.trailer_youtube_id}
                  filmTitle={film.title}
                  label={film.trailer_label}
                />
              </div>
            )}

            {(film.watchlist_count > 0 || film.watcher_count > 0) && (
              <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, color: "var(--muted)", margin: "26px 0 0" }}>
                {film.watchlist_count > 0 && (
                  <span><strong style={{ color: "var(--accent)" }}>{compactCount(film.watchlist_count)}</strong> goblin{film.watchlist_count === 1 ? " is" : "s are"} eyeing this</span>
                )}
                {film.watchlist_count > 0 && film.watcher_count > 0 && " · "}
                {film.watcher_count > 0 && (
                  <span><strong style={{ color: "var(--accent)" }}>{compactCount(film.watcher_count)}</strong> ha{film.watcher_count === 1 ? "s" : "ve"} watched it</span>
                )}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Verdict band — CovenScore + watchers, side-by-side, separate section. */}
      {(((film.coven_rating_count ?? 0) > 0) || (user && (covenWatchers.length > 0 || otherWatchersResult.totalCount > 0))) && (
        <section style={{ background: "var(--void-2)", color: "var(--bone)", borderBottom: "3px solid var(--void)", padding: "40px 0" }}>
          <div className="container-wide stackable" style={{ "--stack-template": "1fr 1fr", "--stack-gap": "40px", alignItems: "start" } as React.CSSProperties}>
            {(film.coven_rating_count ?? 0) > 0 ? (
              <div>
                <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 12 }}>The Verdict</div>
                <CovenScore pct={film.coven_rating_pct ?? null} count={film.coven_rating_count ?? 0} />
              </div>
            ) : <div />}
            {user && (covenWatchers.length > 0 || otherWatchersResult.totalCount > 0) ? (
              <div>
                <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 12 }}>Who&rsquo;s Watched</div>
                <FilmWatchersStrip
                  covenWatchers={covenWatchers}
                  otherWatchers={otherWatchersResult.users}
                  otherCount={otherWatchersResult.totalCount}
                />
              </div>
            ) : <div />}
          </div>
        </section>
      )}

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
