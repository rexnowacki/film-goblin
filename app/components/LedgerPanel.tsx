import Link from "next/link";
import FilmPoster from "@/components/FilmPoster";
import type { LedgerFilm } from "@/lib/queries/ledger";

export default function LedgerPanel({ films }: { films: LedgerFilm[] }) {
  return (
    <div>
      <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>Your Ledger</div>
      {films.length === 0 ? (
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
          No price drops on your watchlist right now.
        </p>
      ) : (
        <>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
            Price drops on your watchlist
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {films.map(film => (
              <Link
                key={film.id}
                href={`/film/${film.id}`}
                style={{ display: "flex", gap: 12, alignItems: "flex-start", textDecoration: "none" }}
              >
                <FilmPoster
                  film={film}
                  size="sm"
                  style={{ width: 52, height: 78, flexShrink: 0, borderRadius: 1 }}
                />
                <div style={{ minWidth: 0, paddingTop: 2 }}>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--bone)", lineHeight: 1.3, marginBottom: 3 }}>
                    {film.title}
                  </div>
                  <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>
                    {film.director} · {film.year}
                  </div>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                    ↓ Price dropped
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
