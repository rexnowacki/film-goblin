import Link from "next/link";
import FilmPoster from "@/components/FilmPoster";
import GoblinWhisperButton from "@/components/GoblinWhisperButton";
import type { GoblinPickFilm } from "@/lib/queries/goblin-pick";

export default function GoblinRecommends({ film }: { film: GoblinPickFilm | null }) {
  return (
    <div>
      <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 14, letterSpacing: "0.12em" }}>
        The Goblin Recommends
      </div>

      {film ? (
        <>
          <Link href={`/film/${film.id}`} style={{ display: "block", textDecoration: "none", marginBottom: 14 }}>
            <FilmPoster
              film={film}
              size="md"
              imageSizes="224px"
              style={{ width: "70%", height: "auto", aspectRatio: "2 / 3", display: "block", margin: "0 auto" }}
            />
          </Link>

          <Link href={`/film/${film.id}`} style={{ textDecoration: "none" }}>
            <div className="h-display" style={{ fontSize: 20, lineHeight: 1.15, color: "var(--bone)", marginBottom: 4 }}>
              {film.title}
            </div>
          </Link>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
            {film.director} · {film.year}
          </div>
          <a
            href={film.itunes_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--accent)", textDecoration: "none", letterSpacing: "0.06em" }}
          >
            Watch on Apple TV →
          </a>

          {film.whisper_text && (
            <GoblinWhisperButton
              filmId={film.id}
              filmTitle={film.title}
              whisperText={film.whisper_text}
            />
          )}
        </>
      ) : (
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)" }}>
          No pick set yet.
        </p>
      )}
    </div>
  );
}
