"use client";

import Link from "next/link";
import FilmPoster from "./FilmPoster";
import PosterQuickAdd from "./PosterQuickAdd";
import type { Shelf } from "@/lib/queries/fyp/shelves";
import type { FilmLite } from "@/lib/queries/fyp/forYou";

interface Props {
  shelf: Shelf;
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
  shelf, filmsById, dismissed, onDismiss, onUndo, registerCard,
  watchlistIds, libraryIds, sharerUsername,
}: Props) {
  const visible = shelf.filmIds.filter(id => filmsById.has(id));
  if (visible.length === 0) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 className="head" style={{ fontSize: 20, marginBottom: 12 }}>{shelf.title}</h2>
      <div style={{
        display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8,
        scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch",
      }}>
        {visible.map(filmId => {
          const film = filmsById.get(filmId)!;
          if (dismissed.has(filmId)) {
            return (
              <div key={filmId} style={{
                flex: "0 0 140px", scrollSnapAlign: "start", display: "grid",
                placeItems: "center", aspectRatio: "2/3", border: "1px dashed var(--muted)",
              }}>
                <button type="button" onClick={() => onUndo(filmId)} className="caps" style={{
                  background: "transparent", border: "none", color: "var(--muted)",
                  fontSize: 10, cursor: "pointer", fontFamily: "var(--font-ui)",
                }}>
                  Hidden — undo
                </button>
              </div>
            );
          }
          return (
            <div key={filmId} ref={el => registerCard(el, filmId)} data-film-id={filmId}
              style={{ flex: "0 0 140px", scrollSnapAlign: "start", position: "relative" }}>
              <Link prefetch={false} href={`/film/${filmId}`} style={{ textDecoration: "none", color: "inherit" }}>
                <PosterQuickAdd
                  filmId={filmId}
                  initialOnWatchlist={watchlistIds.has(filmId)}
                  initialInLibrary={libraryIds.has(filmId)}
                  filmTitle={film.title}
                  filmYear={film.year}
                  sharerUsername={sharerUsername}
                  onNotInterested={() => onDismiss(filmId)}
                >
                  <FilmPoster film={film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                </PosterQuickAdd>
                <div className="head" style={{ fontSize: 14, lineHeight: 1.1, marginTop: 8 }}>{film.title}</div>
                <div className="caps" style={{ fontSize: 9, color: "var(--muted)", marginTop: 3 }}>{film.year}</div>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
