interface Props {
  filled: boolean;
  size?: number;
}

// Sharp-geometry classic heart. Miter linejoin keeps the lobes pointed
// (not rounded) — matches the spec's "no chubby, bubbly edges" rule.
export default function HeartIcon({ filled, size = 16 }: Props) {
  const w = size;
  const h = Math.round((size * 14) / 16); // preserve 18:16 → width:height ratio
  return (
    <svg viewBox="0 0 18 16" width={w} height={h} aria-hidden="true">
      <path
        d="M9 15 L1 7 A4 4 0 0 1 9 3 A4 4 0 0 1 17 7 Z"
        fill={filled ? "var(--accent)" : "none"}
        stroke={filled ? "var(--accent)" : "var(--muted)"}
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
