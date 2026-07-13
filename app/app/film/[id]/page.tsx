import type { Metadata } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
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
import { getFilmTags } from "@/lib/queries/film-tags";
import { getFilmCast } from "@/lib/queries/film-cast";
import { getCovenWatchersForFilm, getOtherWatchersForFilm } from "@/lib/queries/film-watchers";
import { getFilmWatchProviders } from "@/lib/queries/streaming-availability";
import { getActiveShowtimesForFilm } from "@/lib/queries/showtimes";
import { compactCount } from "@/lib/format";
import FilmPoster from "@/components/FilmPoster";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FilmActions from "@/components/FilmActions";
import PriceStatBlock from "@/components/PriceStatBlock";
import FilmPriceLedger from "@/components/FilmPriceLedger";
import CovenScore from "@/components/CovenScore";
import FilmTagsRow from "@/components/FilmTagsRow";
import ShareFilmButton from "@/components/ShareFilmButton";
import ShowtimesSheet from "@/components/ShowtimesSheet";
import TrailerButton from "@/components/TrailerButton";
import SharerWatchPin from "@/components/SharerWatchPin";
import FilmCTABanner from "@/components/FilmCTABanner";
import FilmDescription from "@/components/FilmDescription";
import FilmCastStrip from "@/components/FilmCastStrip";
import FilmPriceSticker from "@/components/FilmPriceSticker";
import BuyOnAppleLink from "@/components/BuyOnAppleLink";
import FilmWatchersStrip from "@/components/FilmWatchersStrip";
import WatchProviders from "@/components/WatchProviders";
import PlanWatchButton from "@/components/gazing/PlanWatchButton";

const RecommendModal = dynamic(() => import("@/components/RecommendModal"));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const film = await getFilm(supabase, id);
  if (!film) return { title: "Film Goblin" };

  const title = `${film.title} (${film.year})`;
  const description = film.description?.trim() || `${film.director}, ${film.year}.`;
  const url = `https://freshfromthepit.com/film/${film.id}`;
  const ogImageUrl = `https://freshfromthepit.com/api/og/film/${film.id}`;

  return {
    title: `${title} — Film Goblin`,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImageUrl, width: 1000, height: 1500, alt: film.title }],
      type: "video.movie",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
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
  const [film, history, reviews, filmCast, watchProviders, showtimes, user, filmTags, sharerWatch] = await Promise.all([
    getFilm(supabase, id),
    getLatestPriceHistory(supabase, id, 180),
    getPublishedReviewsForFilm(supabase, id),
    getFilmCast(supabase, id),
    getFilmWatchProviders(supabase, id),
    getActiveShowtimesForFilm(supabase, id),
    getServerUser(),
    getFilmTags(supabase, id),
    fromUsername ? getSharerWatchForFilm(fromUsername, id) : Promise.resolve(null),
  ]);
  // Price history is oldest to newest; the last capture is the current price.
  const currentPrice = history.length > 0 ? Number(history[history.length - 1].price_usd) : null;

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

  return (
    <div className="film-detail-page">
      {!user && <FilmCTABanner fromUsername={fromUsername} />}
      <TopNav current="films" showBack />
      <BottomNav current="films" />

      <main>
        <section className="film-detail-hero">
          <div className="container-wide film-detail-hero__inner">
            <header className="film-detail-identity">
              <div className="eyebrow">{film.genre_primary || "From the archive"}</div>
              <h1>{film.title}<span aria-hidden="true">.</span></h1>
              <div className="film-detail-meta">
                <span>{film.year}</span>
                <span aria-hidden="true">·</span>
                <span>
                  Dir.{" "}
                  {film.director ? (
                    <Link prefetch={false} href={`/director/${encodeURIComponent(film.director)}`}>
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
              {sharerWatch && <SharerWatchPin watch={sharerWatch} />}
            </header>

            <div className="film-detail-poster-wrap">
              <FilmPoster
                film={film as never}
                size="xl"
                className="film-detail-poster"
                style={{ width: "100%", height: "auto", aspectRatio: "2 / 3", boxShadow: "12px 14px 0 color-mix(in srgb, var(--accent) 30%, transparent)" }}
                priority
              />
              {(film.watchlist_count > 0 || film.watcher_count > 0) && (
                <p className="film-detail-interest">
                  {film.watchlist_count > 0 && (
                    <span><strong>{compactCount(film.watchlist_count)}</strong> goblin{film.watchlist_count === 1 ? " is" : "s are"} eyeing this</span>
                  )}
                  {film.watchlist_count > 0 && film.watcher_count > 0 && <span aria-hidden="true"> · </span>}
                  {film.watcher_count > 0 && (
                    <span><strong>{compactCount(film.watcher_count)}</strong> ha{film.watcher_count === 1 ? "s" : "ve"} watched it</span>
                  )}
                </p>
              )}
            </div>

            <div className="film-detail-story">
              {film.description && <FilmDescription text={film.description} />}
              <FilmTagsRow visible={filmTags.visible} director={film.director} />

              {film.itunes_url && currentPrice != null && (
                <div className="film-detail-price-sticker">
                  <FilmPriceSticker price={currentPrice} history={history} />
                </div>
              )}

              <section className="film-detail-actions" aria-labelledby="film-actions-heading">
                <div className="film-detail-actions__heading">
                  <span className="eyebrow">Choose your ritual</span>
                  <h2 id="film-actions-heading">What happens next?</h2>
                </div>
                <div className="film-detail-actions__grid">
                  {user && (
                    <FilmActions
                      filmId={film.id}
                      filmTitle={film.title}
                      initialOnWatchlist={onList}
                      initialOwned={owned}
                      initialWatchCount={watchCount}
                      currentlyShowing={showtimes.length > 0}
                    />
                  )}
                  {user && <RecommendModal
                    filmId={film.id}
                    filmTitle={film.title}
                    covenMembers={covenMembers.map(m => ({ id: m.id, username: m.username, display_name: m.display_name, avatar_url: m.avatar_url }))}
                    topCovenMemberIds={topCovenMemberIds}
                  />}
                  {user && <PlanWatchButton filmId={film.id} filmTitle={film.title} members={covenMembers.map(member => ({ id: member.id, username: member.username, avatar_url: member.avatar_url }))} />}
                  <ShareFilmButton
                    filmId={film.id}
                    title={film.title}
                    year={film.year}
                    sharerUsername={myProfile?.username ?? null}
                  />
                  {showtimes.length > 0 && (
                    <ShowtimesSheet
                      showtimes={showtimes}
                      filmId={film.id}
                      filmTitle={film.title}
                      canInvite={Boolean(user)}
                    />
                  )}
                  {film.itunes_url && (
                    <BuyOnAppleLink
                      filmId={film.id}
                      title={film.title}
                      price={currentPrice}
                      href={film.itunes_url}
                      signedIn={Boolean(user)}
                      className="btn btn-lg"
                    >
                      Buy on Apple TV →
                    </BuyOnAppleLink>
                  )}
                </div>
              </section>

              {film.trailer_youtube_id && (
                <div className="film-detail-trailer">
                  <TrailerButton
                    youtubeId={film.trailer_youtube_id}
                    filmTitle={film.title}
                    label={film.trailer_label}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {(filmCast.length > 0 || watchProviders.length > 0) && (
          <section className="film-detail-info-room">
            <div className="container-wide film-detail-info-grid">
              {filmCast.length > 0 && (
                <div className="film-detail-info-card film-detail-info-card--cast">
                  <FilmCastStrip cast={filmCast} />
                </div>
              )}
              {watchProviders.length > 0 && (
                <div className="film-detail-info-card film-detail-info-card--streaming">
                  <WatchProviders providers={watchProviders} />
                </div>
              )}
            </div>
          </section>
        )}

        {(() => {
          const hasVerdict = (film.coven_rating_count ?? 0) > 0;
          const hasWatchers = Boolean(user) && (covenWatchers.length > 0 || otherWatchersResult.totalCount > 0);
          if (!hasVerdict && !hasWatchers) return null;
          return (
            <section className="film-detail-coven-room">
              <div className={`container-wide film-detail-coven-grid${hasVerdict && hasWatchers ? "" : " film-detail-coven-grid--solo"}`}>
                {hasVerdict && (
                  <div className="film-detail-coven-card">
                    <div className="eyebrow">The Verdict</div>
                    <CovenScore pct={film.coven_rating_pct ?? null} count={film.coven_rating_count ?? 0} />
                  </div>
                )}
                {hasWatchers && (
                  <div className="film-detail-coven-card">
                    <div className="eyebrow">Who&rsquo;s Watched</div>
                    <FilmWatchersStrip
                      covenWatchers={covenWatchers}
                      otherWatchers={otherWatchersResult.users}
                      otherCount={otherWatchersResult.totalCount}
                    />
                  </div>
                )}
              </div>
            </section>
          );
        })()}

        <section className="film-detail-price-room grain-light">
          <div className="container-wide">
            <div className="film-detail-section-heading film-detail-section-heading--dark">
              <div className="eyebrow">The Price Scroll · 180 Days</div>
              <h2>What it <em>has been worth</em>.</h2>
            </div>
            {history.length > 0 ? (
              <>
                <PriceStatBlock history={history} />
                <FilmPriceLedger history={history} />
              </>
            ) : (
              <div className="film-detail-empty-note">
                No price history yet. Check back after the first worker run.
              </div>
            )}
          </div>
        </section>

        {reviews.length > 0 && (
          <section className="film-detail-reviews-room">
            <div className="container-wide">
              <div className="film-detail-section-heading">
                <div className="eyebrow">Editorial Reviews</div>
                <h2>Notes from the dark.</h2>
              </div>
              <div className="film-detail-reviews-grid">
                {reviews.map(r => (
                  <article key={r.id} className="film-detail-review-card">
                    <h3>{r.title}</h3>
                    <p>{r.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
