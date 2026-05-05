import Link from "next/link";
import FilmPoster from "@/components/FilmPoster";
import Avatar from "@/components/Avatar";
import type { GoblinPickFilm } from "@/lib/queries/goblin-pick";

const DUMMY_REVIEWS = [
  {
    username: "carrion_flower",
    color: "#9b72cf",
    pullquote: "Brutal and strange in the best way. Feels like a dispatch from a timeline where horror never lost its nerve.",
    date: "Apr 29",
  },
  {
    username: "the_wicker_son",
    color: "#e08b4a",
    pullquote: "Genuinely unnerving. The kind of film that follows you home.",
    date: "Apr 27",
  },
  {
    username: "hexed_librarian",
    color: "#5ea87c",
    pullquote: "Cinema as ritual. Required viewing.",
    date: "Apr 25",
  },
];

export default function GoblinRecommends({ film }: { film: GoblinPickFilm | null }) {
  return (
    <div>
      <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 14, letterSpacing: "0.12em" }}>
        The Goblin Recommends
      </div>

      {film ? (
        <>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
            <Link href={`/film/${film.id}`} style={{ flexShrink: 0, textDecoration: "none" }}>
              <FilmPoster
                film={film}
                size="sm"
                style={{ width: 88, height: 130 }}
              />
            </Link>
            <div style={{ paddingTop: 4, minWidth: 0 }}>
              <Link href={`/film/${film.id}`} style={{ textDecoration: "none" }}>
                <div
                  className="h-display"
                  style={{ fontSize: 18, lineHeight: 1.15, color: "var(--bone)", marginBottom: 6 }}
                >
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
            </div>
          </div>

          <div style={{ borderTop: "1px solid #222", paddingTop: 16 }}>
            <div className="eyebrow" style={{ color: "var(--muted)", fontSize: 9, marginBottom: 12 }}>
              Coven Reviews
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {DUMMY_REVIEWS.map(r => (
                <div key={r.username} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <Avatar name={r.username} color={r.color} size={26} url={null} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--bone)" }}>
                        {r.username}
                      </span>
                      <span style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--muted)" }}>
                        {r.date}
                      </span>
                    </div>
                    <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
                      "{r.pullquote}"
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)" }}>
          No pick set yet.
        </p>
      )}
    </div>
  );
}
