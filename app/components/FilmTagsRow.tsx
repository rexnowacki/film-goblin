import Link from "next/link";
import type { FilmTagRow } from "@/lib/queries/film-tags";

interface Props {
  visible: FilmTagRow[];
  director: string;
}

/**
 * Renders the editorial 5-slot capsule on /film/[id] from the v2 tagging
 * system: pink Primary subgenre pill, plum director pill, up to 3
 * seafoam-outline distinguishing pills.
 *
 * Sparse curation (fewer than 4 visible tags) means fewer pills, no
 * padding. Empty director omits that slot. Visible array comes from
 * getFilmTags's positions 1-4; the hidden tail (positions 5+) is not
 * rendered here — it feeds the FYP recommender.
 *
 * Non-director pills link to /tags/[name] listing pages.
 */
export default function FilmTagsRow({ visible, director }: Props) {
  if (visible.length === 0 && !director) return null;

  const primary = visible.find(t => t.is_primary);
  const distinguishing = visible.filter(t => !t.is_primary).slice(0, 3);

  return (
    <div className="film-tags-row">
      {primary && (
        <Link href={`/tags/${encodeURIComponent(primary.name)}`} style={{ textDecoration: "none", color: "inherit" }}>
          <span className="film-tag film-tag-subgenre" title="Sub-genre">
            {primary.name}
          </span>
        </Link>
      )}
      {director && (
        <span className="film-tag film-tag-director" title="Director">
          {director}
        </span>
      )}
      {distinguishing.map(t => (
        <Link key={t.id} href={`/tags/${encodeURIComponent(t.name)}`} style={{ textDecoration: "none", color: "inherit" }}>
          <span className="film-tag film-tag-vibe" title={t.type}>
            {t.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
