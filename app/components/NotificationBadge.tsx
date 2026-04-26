interface Props {
  count: number;
  size?: number;
}

export default function NotificationBadge({ count, size = 28 }: Props) {
  if (count <= 0) return null;
  const display = count > 9 ? "9+" : String(count);
  const w = size;
  const h = Math.round(size * 1.25);
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 40 50"
      role="img"
      aria-label={`${count} unread notification${count === 1 ? "" : "s"}`}
      style={{ display: "block" }}
    >
      {/* Drop shape: rounded teardrop, var(--accent) fill, var(--void) stroke */}
      <path
        d="M20 3 C12 14, 4 23, 4 33 C4 41.7, 11.2 48, 20 48 C28.8 48, 36 41.7, 36 33 C36 23, 28 14, 20 3 Z"
        fill="var(--accent)"
        stroke="var(--void)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Highlight */}
      <ellipse cx="14" cy="16" rx="2.6" ry="3.6" fill="rgba(255,255,255,0.85)" />
      <text
        x="20"
        y="38"
        textAnchor="middle"
        fontFamily="var(--font-display), Georgia, serif"
        fontSize={display.length > 1 ? 16 : 20}
        fontWeight={900}
        fill="var(--void)"
      >
        {display}
      </text>
    </svg>
  );
}
