import Link from "next/link";
import FilmPoster from "@/components/FilmPoster";
import GoblinWhisperButton from "@/components/GoblinWhisperButton";
import type { GoblinPickFilm } from "@/lib/queries/goblin-pick";

// Mobile-only variant of GoblinRecommends. Sits above the feed, full-width,
// poster left + meta/whisper right. Wrapper is .mobile-only so desktop never sees it.
export default function GoblinRecommendsMobile({ film }: { film: GoblinPickFilm | null }) {
  if (!film) return null;

  return (
    <section
      className="mobile-only"
      style={{
        marginBottom: 24,
        padding: 14,
        border: "1px solid #2a2a2a",
        background: "var(--void-2, #141414)",
        position: "relative",
      }}
    >
      <div
        className="eyebrow"
        style={{ color: "var(--accent)", marginBottom: 12, letterSpacing: "0.12em", fontSize: 10 }}
      >
        The Goblin Recommends
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <Link
          href={`/film/${film.id}`}
          style={{ display: "block", flexShrink: 0, textDecoration: "none" }}
        >
          <FilmPoster
            film={film}
            size="sm"
            imageSizes="120px"
            style={{ width: 110, height: 165, aspectRatio: "2 / 3" }}
          />
        </Link>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/film/${film.id}`} style={{ textDecoration: "none" }}>
            <div
              className="h-display"
              style={{
                fontSize: 22,
                lineHeight: 1.1,
                color: "var(--bone)",
                marginBottom: 4,
                wordBreak: "break-word",
              }}
            >
              {film.title}
            </div>
          </Link>
          <div
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 12,
              color: "var(--muted)",
              marginBottom: 10,
            }}
          >
            {film.director} · {film.year}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <a
              href={film.itunes_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--accent)",
                textDecoration: "none",
                letterSpacing: "0.06em",
              }}
            >
              Watch on Apple TV →
            </a>
            <Link
              href="/ritual"
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--bone)",
                textDecoration: "none",
                letterSpacing: "0.06em",
              }}
            >
              Join the Ritual →
            </Link>
          </div>
        </div>
      </div>

      {film.whisper_text && (
        <GoblinWhisperButton
          filmId={film.id}
          filmTitle={film.title}
          whisperText={film.whisper_text}
        />
      )}
    </section>
  );
}
