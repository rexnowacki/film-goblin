import type { MatchBand } from "@/lib/queries/fyp/score";

interface Props {
  band: MatchBand | null;
  covenFavorite?: boolean;
}

const BAND_COPY: Record<MatchBand, { label: string; cls: string }> = {
  hexed:        { label: "Hexed for You", cls: "match-pill match-band-hexed" },
  strong:       { label: "Strong Match",  cls: "match-pill match-band-strong" },
  good_omen:    { label: "Good Omen",     cls: "match-pill match-band-good" },
  strange_pull: { label: "Strange Pull",  cls: "match-pill match-band-strange" },
};

/**
 * Match-band pill on each /for-you poster.
 *
 * Per math review (sub-project #37): replaces the calibrated-percentage
 * display from #36. A "94%" pill implies probability we cannot validate
 * at small data volumes. Bands ("Hexed for You" / "Strong Match" / "Good
 * Omen" / "Strange Pull") signal ranking-relative position without
 * over-promising precision.
 *
 * Bottom-15% films get no badge (the rank itself communicates that).
 *
 * Optional companion `covenFavorite` boolean overlays a separate "Coven
 * Favorite" badge when the film has a non-zero coven-rating bonus —
 * orthogonal social signal alongside the personal-fit band.
 */
export default function MatchPill({ band, covenFavorite }: Props) {
  if (!band && !covenFavorite) return null;
  return (
    <>
      {band && (
        <span className={BAND_COPY[band].cls} aria-label={BAND_COPY[band].label}>
          {BAND_COPY[band].label}
        </span>
      )}
      {covenFavorite && (
        <span className="match-pill match-coven-favorite" aria-label="Coven favorite">
          Coven Favorite
        </span>
      )}
    </>
  );
}
