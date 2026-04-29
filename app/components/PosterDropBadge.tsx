interface Props {
  dropPct: number | null;
}

export default function PosterDropBadge({ dropPct }: Props) {
  if (dropPct == null || dropPct < 0.10) return null;
  const pct = Math.round(dropPct * 100);
  return (
    <span className="poster-drop-badge caps" aria-label={`${pct} percent off`}>
      {pct}% OFF
    </span>
  );
}
