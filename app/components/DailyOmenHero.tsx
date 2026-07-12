"use client";

import Link from "next/link";
import FilmPoster from "./FilmPoster";
import PosterQuickAdd from "./PosterQuickAdd";
import type { FilmLite } from "@/lib/queries/fyp/forYou";

interface Props {
  film: FilmLite;
  dismissed: boolean;
  onWatchlist: boolean;
  inLibrary: boolean;
  sharerUsername: string | null;
  onDismiss: (filmId: string) => void;
  onUndo: (filmId: string) => void;
}

export default function DailyOmenHero({ film, dismissed, onWatchlist, inLibrary, sharerUsername, onDismiss, onUndo }: Props) {
  if (dismissed) {
    return (
      <div className="daily-omen daily-omen--hidden">
        <button type="button" onClick={() => onUndo(film.id)} className="caps">
          Hidden — undo
        </button>
      </div>
    );
  }

  return (
    <article className="daily-omen">
      <div className="daily-omen__mark" aria-hidden="true"><span>☾</span></div>
      <div className="daily-omen__poster">
        <PosterQuickAdd
          filmId={film.id}
          initialOnWatchlist={onWatchlist}
          initialInLibrary={inLibrary}
          filmTitle={film.title}
          filmYear={film.year}
          sharerUsername={sharerUsername}
          onNotInterested={() => onDismiss(film.id)}
        >
          <Link prefetch={false} href={`/film/${film.id}`} aria-label={`Open ${film.title}`}>
            <FilmPoster film={film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
          </Link>
        </PosterQuickAdd>
      </div>
      <div className="daily-omen__copy">
        <div className="eyebrow">Daily Omen · Today&apos;s reading</div>
        <h2>{film.title}</h2>
        <div className="daily-omen__meta">{film.director} · {film.year}</div>
        <p>The goblin consulted the entrails. Today they point here.</p>
        <Link prefetch={false} href={`/film/${film.id}`} className="btn">Follow the omen →</Link>
      </div>
    </article>
  );
}
