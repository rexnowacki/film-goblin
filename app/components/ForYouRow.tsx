import Link from "next/link";
import FilmPoster from "./FilmPoster";
import type { ScoredFilm } from "@/lib/queries/fyp/score";
import type { FilmLite } from "@/lib/queries/fyp/forYou";

interface Props {
  film: FilmLite;
  reason: ScoredFilm["topReason"];
}

function reasonText(r: ScoredFilm["topReason"]): string {
  switch (r.kind) {
    case "tag": return `matches your ${r.tagName} affinity`;
    case "lane": return `matches your ${r.tagName} lane`;
    case "coven_rating": return "highly rated by your coven";
    case "director": return "from a director you've watched";
    case "starter": return "starter pick — tag a few films to personalize";
  }
}

export default function ForYouRow({ film, reason }: Props) {
  return (
    <Link
      href={`/film/${film.id}`}
      className="stackable"
      style={{
        "--stack-template": "120px 1fr",
        "--stack-gap": "16px",
        display: "grid",
        textDecoration: "none",
        color: "inherit",
      } as React.CSSProperties}
    >
      <FilmPoster film={film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
      <div>
        <div className="head" style={{ fontSize: 22, lineHeight: 1.05 }}>{film.title}</div>
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
          {film.director} · {film.year}
        </div>
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          {reasonText(reason)}
        </div>
      </div>
    </Link>
  );
}
