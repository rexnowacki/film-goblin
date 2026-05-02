interface Props {
  subgenre: string | null;
  director: string;
  vibes: string[];
}

/**
 * Visual demo of the tagging system shape proposed in the tagging review
 * (docs/proposals/2026-05-01-tagging-and-fyp-review.md). Renders small pills
 * for sub-genre + director + 3 vibes. Currently uses films.genre_primary
 * (iTunes raw category) for sub-genre and a hardcoded vibe array — swap to
 * real film_tags data once the tagging sub-project ships.
 */
export default function FilmTagsRow({ subgenre, director, vibes }: Props) {
  return (
    <div className="film-tags-row">
      {subgenre && (
        <span className="film-tag film-tag-subgenre" title="Sub-genre">
          {subgenre.toLowerCase()}
        </span>
      )}
      <span className="film-tag film-tag-director" title="Director">
        {director}
      </span>
      {vibes.slice(0, 3).map(v => (
        <span key={v} className="film-tag film-tag-vibe" title="Vibe">
          {v}
        </span>
      ))}
    </div>
  );
}
