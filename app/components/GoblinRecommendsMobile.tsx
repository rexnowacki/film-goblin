import Link from "next/link";
import FilmPoster from "@/components/FilmPoster";
import GoblinWhisperButton from "@/components/GoblinWhisperButton";
import GoblinRitualLauncher from "@/components/GoblinRitualLauncher";
import type { GoblinPickFilm } from "@/lib/queries/goblin-pick";
import type { RitualMessage, RitualPick } from "@/lib/queries/ritual";

// Compact mobile-only feed insert. Desktop keeps the full right-rail card.
interface Props {
  film: GoblinPickFilm | null;
  ritual: {
    pick: RitualPick | null;
    initialMessages: RitualMessage[];
    currentUserId: string | null;
    viewerUsername: string | null;
    viewerAvatarUrl: string | null;
    viewerDisplayName: string | null;
    viewerIsAdmin?: boolean;
  };
}

export default function GoblinRecommendsMobile({ film, ritual }: Props) {
  if (!film) return null;

  return (
    <section
      className="mobile-only"
      style={{
        padding: "12px 0",
        borderTop: "1px solid #2a2a2a",
        borderBottom: "1px solid #2a2a2a",
        background: "rgba(255, 255, 255, 0.018)",
        position: "relative",
      }}
    >
      <div
        className="eyebrow"
        style={{ color: "var(--accent)", marginBottom: 8, letterSpacing: "0.12em", fontSize: 9 }}
      >
        Goblin Pick
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Link
          href={`/film/${film.id}`}
          style={{ display: "block", flexShrink: 0, textDecoration: "none" }}
        >
          <FilmPoster
            film={film}
            size="sm"
            imageSizes="72px"
            style={{ width: 64, height: 96, aspectRatio: "2 / 3" }}
          />
        </Link>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/film/${film.id}`} style={{ textDecoration: "none" }}>
            <div
              className="h-display"
              style={{
                fontSize: 18,
                lineHeight: 1.1,
                color: "var(--bone)",
                marginBottom: 3,
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
              fontSize: 11,
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            {film.director} · {film.year}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <a
              href={film.itunes_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 10,
                color: "var(--accent)",
                textDecoration: "none",
                letterSpacing: "0.06em",
                display: "inline-block",
              }}
            >
              Apple TV →
            </a>
            <GoblinRitualLauncher
              pick={ritual.pick}
              initialMessages={ritual.initialMessages}
              currentUserId={ritual.currentUserId}
              viewerUsername={ritual.viewerUsername}
              viewerAvatarUrl={ritual.viewerAvatarUrl}
              viewerDisplayName={ritual.viewerDisplayName}
              viewerIsAdmin={ritual.viewerIsAdmin}
              variant="mobile"
            />
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
