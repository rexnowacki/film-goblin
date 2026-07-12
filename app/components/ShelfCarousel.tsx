"use client";

import { useRef } from "react";
import Link from "next/link";
import FilmPoster from "./FilmPoster";
import PosterQuickAdd from "./PosterQuickAdd";
import type { Shelf } from "@/lib/queries/fyp/shelves";
import type { FilmLite } from "@/lib/queries/fyp/forYou";

interface Props {
  shelf: Shelf;
  shelfIndex: number;
  filmsById: Map<string, FilmLite>;
  dismissed: Set<string>;
  onDismiss: (filmId: string) => void;
  onUndo: (filmId: string) => void;
  registerCard: (el: HTMLElement | null, filmId: string) => void;
  watchlistIds: Set<string>;
  libraryIds: Set<string>;
  sharerUsername: string | null;
}

export default function ShelfCarousel({
  shelf, shelfIndex, filmsById, dismissed, onDismiss, onUndo, registerCard,
  watchlistIds, libraryIds, sharerUsername,
}: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const visible = shelf.filmIds.filter(id => filmsById.has(id));
  if (visible.length === 0) return null;

  const treatment = {
    hexed: { mark: "✦", kicker: "Closest pulls", description: "The strongest signals in today's reading." },
    loved_tag: { mark: "◇", kicker: "A familiar hunger", description: "More films along a trail you've already marked." },
    coven: { mark: "☾", kicker: "Coven smoke", description: "Films your people keep carrying back from the dark." },
    new: { mark: "†", kicker: "Freshly unearthed", description: "Recent arrivals that survived your taste filters." },
    strange: { mark: "↝", kicker: "Off the map", description: "Less obvious pulls, left here to surprise you." },
    starter: { mark: "⛧", kicker: "First rites", description: "A hand-picked place to begin feeding the oracle." },
  }[shelf.kind];

  function move(direction: -1 | 1) {
    railRef.current?.scrollBy({ left: direction * Math.max(280, railRef.current.clientWidth * 0.72), behavior: "smooth" });
  }

  return (
    <section className="fyp-shelf" data-shelf-kind={shelf.kind}>
      <header className="fyp-shelf__header">
        <div className="fyp-shelf__mark" aria-hidden="true">{treatment.mark}</div>
        <div className="fyp-shelf__heading">
          <div className="eyebrow">{String(shelfIndex + 1).padStart(2, "0")} · {treatment.kicker}</div>
          <h2>{shelf.title}</h2>
          <p>{treatment.description}</p>
        </div>
        <div className="fyp-shelf__controls">
          <span>{visible.length} films</span>
          <button type="button" onClick={() => move(-1)} aria-label={`Scroll ${shelf.title} left`}>←</button>
          <button type="button" onClick={() => move(1)} aria-label={`Scroll ${shelf.title} right`}>→</button>
        </div>
      </header>
      <div className="fyp-shelf__rail" ref={railRef}>
        {visible.map(filmId => {
          const film = filmsById.get(filmId)!;
          if (dismissed.has(filmId)) {
            return (
              <div key={filmId} className="fyp-shelf-card fyp-shelf-card--hidden">
                <button type="button" onClick={() => onUndo(filmId)} className="caps">
                  Hidden — undo
                </button>
              </div>
            );
          }
          return (
            <div key={filmId} ref={el => registerCard(el, filmId)} data-film-id={filmId} className="fyp-shelf-card">
              <PosterQuickAdd
                filmId={filmId}
                initialOnWatchlist={watchlistIds.has(filmId)}
                initialInLibrary={libraryIds.has(filmId)}
                filmTitle={film.title}
                filmYear={film.year}
                sharerUsername={sharerUsername}
                onNotInterested={() => onDismiss(filmId)}
              >
                <Link prefetch={false} href={`/film/${filmId}`} className="fyp-shelf-card__poster-link" aria-label={`Open ${film.title}`}>
                  <FilmPoster film={film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                </Link>
              </PosterQuickAdd>
              <Link prefetch={false} href={`/film/${filmId}`} className="fyp-shelf-card__link">
                <div className="fyp-shelf-card__title">{film.title}</div>
                <div className="fyp-shelf-card__meta">{film.year} · {film.director}</div>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
