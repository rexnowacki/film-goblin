import type { VerbalKind } from "@/lib/queries/fyp/calibration";

interface Props {
  pct: number | null;
  verbalKind?: VerbalKind | null;
}

const VERBAL_COPY: Record<VerbalKind, string> = {
  strong: "strong match",
  good: "your kind",
  neutral: "interesting pick",
  weak: "outside your lane",
};

/**
 * Displayed on each /for-you poster. Two modes:
 *
 * - Calibrated: numeric pill ("94%") in pink, anchored to the user's own
 *   liked/disliked verdicts. Stable across catalog growth — the percentage
 *   answers "how close is this film to your liked-films mean vs your
 *   disliked-films mean."
 * - Verbal: lowercase italic-feeling pill in bone ("strong match" / "your
 *   kind" / "interesting pick") for users with < 3 verdicts. The numeric
 *   anchor isn't reliable at that data volume, so we hint at strength
 *   without implying probabilistic precision.
 *
 * Renders nothing when both pct and verbalKind are null/undefined.
 */
export default function MatchPill({ pct, verbalKind }: Props) {
  if (pct == null && !verbalKind) return null;
  if (pct != null) {
    return <span className="match-pill" aria-label={`${pct} percent match`}>{pct}%</span>;
  }
  return (
    <span className="match-pill match-verbal" aria-label={VERBAL_COPY[verbalKind!]}>
      {VERBAL_COPY[verbalKind!]}
    </span>
  );
}
