import Link from "next/link";
import FilmPoster from "@/components/FilmPoster";
import type { RitualPick } from "@/lib/queries/ritual";

interface Props {
  pick: RitualPick;
  archived: boolean;
}

export default function RitualHeader({ pick, archived }: Props) {
  return (
    <header
      style={{
        display: "flex",
        gap: 16,
        marginBottom: 14,
        padding: 14,
        border: "1px solid #2a2a2a",
        borderBottom: "3px solid var(--accent)",
        background: "var(--void-2, #141414)",
      }}
    >
      <Link href={`/film/${pick.film.id}`} style={{ display: "block", flexShrink: 0, textDecoration: "none" }}>
        <FilmPoster
          film={pick.film}
          size="sm"
          imageSizes="100px"
          style={{ width: 88, height: 132, aspectRatio: "2 / 3" }}
        />
      </Link>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div className="eyebrow" style={{ color: "var(--accent)", letterSpacing: "0.14em", marginBottom: 6, fontSize: 10 }}>
            {archived ? "Past Ritual" : "The Weekly Ritual Watch"}
          </div>
          <Link href={`/film/${pick.film.id}`} style={{ textDecoration: "none" }}>
            <h1 className="h-display" style={{ fontSize: 28, lineHeight: 1.05, color: "var(--bone)", margin: 0 }}>
              {pick.film.title}
            </h1>
          </Link>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            {pick.film.director} · {pick.film.year}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 10 }}>
          <span
            title={new Date(pick.effective_at).toLocaleString()}
            style={{
              fontFamily: "var(--font-ui)", fontSize: 10, letterSpacing: "0.1em",
              color: "var(--muted)", textTransform: "uppercase",
            }}
          >
            Convened {formatTucson(pick.effective_at)}
          </span>
          {!archived && pick.closes_at && (
            <span
              title={new Date(pick.closes_at).toLocaleString()}
              style={{
                fontFamily: "var(--font-ui)", fontSize: 10, letterSpacing: "0.1em",
                color: "var(--accent)", textTransform: "uppercase",
              }}
            >
              Closes {formatTucson(pick.closes_at)}
            </span>
          )}
          <Link
            href="/ritual/archive"
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: "0.06em",
              color: "var(--muted)", textDecoration: "none",
            }}
          >
            Past rituals →
          </Link>
        </div>
      </div>
    </header>
  );
}

function formatTucson(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
