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
      <div style={{
        display: "grid", placeItems: "center", padding: "40px 16px", marginBottom: 28,
        border: "1px dashed var(--muted)",
      }}>
        <button type="button" onClick={() => onUndo(film.id)} className="caps" style={{
          background: "transparent", border: "none", color: "var(--muted)",
          fontSize: 10, cursor: "pointer", fontFamily: "var(--font-ui)",
        }}>
          Hidden — undo
        </button>
      </div>
    );
  }

  return (
    <Link prefetch={false} href={`/film/${film.id}`} className="stackable" style={{
      "--stack-template": "180px 1fr", "--stack-gap": "20px",
      display: "grid", textDecoration: "none", color: "inherit",
      border: "2px solid var(--accent)", padding: 16, marginBottom: 28,
      position: "relative",
    } as React.CSSProperties}>
      <PosterQuickAdd
        filmId={film.id}
        initialOnWatchlist={onWatchlist}
        initialInLibrary={inLibrary}
        filmTitle={film.title}
        filmYear={film.year}
        sharerUsername={sharerUsername}
        onNotInterested={() => onDismiss(film.id)}
      >
        <FilmPoster film={film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
      </PosterQuickAdd>
      <div>
        <div className="caps" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.1em" }}>
          Daily Omen
        </div>
        <div className="head" style={{ fontSize: 28, lineHeight: 1.05, marginTop: 8 }}>{film.title}</div>
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
          {film.director} · {film.year}
        </div>
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)", marginTop: 10 }}>
          The goblin consulted the entrails. Today they point here.
        </div>
      </div>
    </Link>
  );
}
