"use client";

import Link from "next/link";
import FilmPoster from "./FilmPoster";
import MatchPill from "./MatchPill";
import type { ScoredFilm } from "@/lib/queries/fyp/score";
import type { FilmLite } from "@/lib/queries/fyp/forYou";

interface Props {
  film: FilmLite;
  scored: ScoredFilm;
  dismissed: boolean;
  onDismiss: (filmId: string) => void;
  onUndo: (filmId: string) => void;
}

export default function DailyOmenHero({ film, scored, dismissed, onDismiss, onUndo }: Props) {
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
      <div style={{ position: "relative" }}>
        <FilmPoster film={film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
        <MatchPill band={scored.matchBand} covenFavorite={scored.covenFavorite} />
      </div>
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
      <button
        type="button"
        aria-label={`Not interested in ${film.title}`}
        onClick={e => { e.preventDefault(); onDismiss(film.id); }}
        style={{
          position: "absolute", top: 8, right: 8, width: 26, height: 26,
          background: "rgba(10,10,10,0.75)", color: "var(--bone)",
          border: "1px solid var(--muted)", cursor: "pointer",
          fontSize: 13, lineHeight: 1, display: "grid", placeItems: "center",
        }}
      >
        ✕
      </button>
    </Link>
  );
}
