import Link from "next/link";
import type { GoblinPickFilm } from "@/lib/queries/goblin-pick";

const DUMMY_EDITORIAL_REVIEWS = [
  {
    publication: "Bloody Disgusting",
    pullquote: "A new benchmark for American horror. Terrifying, beautiful, and impossible to shake.",
    rating: "5/5",
    url: "#",
    artworkUrl: "https://a5.mzstatic.com/us/r1000/0/Music/v4/a6/c2/b5/a6c2b5b0-5d2f-4b50-a7b7-e87de1e08e8b/cover.jpg",
  },
  {
    publication: "The Film Stage",
    pullquote: "Uncompromising and visceral. Genre filmmaking at its most essential.",
    rating: "A−",
    url: "#",
    artworkUrl: null,
  },
  {
    publication: "Letterboxd — Popular Reviews",
    pullquote: "Watched this alone at midnight. Big mistake.",
    rating: "★★★★½",
    url: "#",
    artworkUrl: null,
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
          {/* Large poster — fills roughly half the sidebar's vertical space */}
          <Link href={`/film/${film.id}`} style={{ display: "block", textDecoration: "none", marginBottom: 14 }}>
            {film.artwork_url ? (
              <img
                src={film.artwork_url}
                alt={film.title}
                style={{ width: "70%", height: "auto", display: "block", margin: "0 auto" }}
              />
            ) : (
              <div style={{ width: "70%", aspectRatio: "2/3", background: "var(--void-2)", border: "1px solid #333", margin: "0 auto" }} />
            )}
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

          <div style={{ borderTop: "1px solid #222", marginTop: 16, paddingTop: 14 }}>
            <div className="eyebrow" style={{ color: "var(--muted)", fontSize: 9, marginBottom: 12 }}>
              Editorial Reviews
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {DUMMY_EDITORIAL_REVIEWS.map(r => (
                <a
                  key={r.publication}
                  href={r.url}
                  style={{ display: "flex", gap: 10, alignItems: "flex-start", textDecoration: "none" }}
                >
                  <div style={{ width: 32, height: 48, flexShrink: 0, background: "var(--void-2)", border: "1px solid #333", overflow: "hidden" }}>
                    {r.artworkUrl && (
                      <img src={r.artworkUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--bone)", lineHeight: 1.3 }}>
                        {r.publication}
                      </span>
                      <span style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--accent)", flexShrink: 0 }}>
                        {r.rating}
                      </span>
                    </div>
                    <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, color: "var(--muted)", lineHeight: 1.45, margin: 0 }}>
                      "{r.pullquote}"
                    </p>
                  </div>
                </a>
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
