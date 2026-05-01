"use client";

import { compactCount } from "@/lib/format";

interface Props {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}

function SpeechIcon({ filled }: { filled: boolean }) {
  // Simple speech bubble — sharp corners + miter joins to match HeartIcon.
  return (
    <svg viewBox="0 0 18 16" width="16" height="14" aria-hidden="true">
      <path
        d="M2 2 L16 2 L16 11 L9 11 L5 14 L5 11 L2 11 Z"
        fill={filled ? "var(--accent)" : "none"}
        stroke={filled ? "var(--accent)" : "var(--muted)"}
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export default function CommentButton({ count, expanded, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`heart-btn ${expanded ? "heart-liked" : ""}`}
      aria-label={expanded ? "Hide comments" : "Show comments"}
      aria-expanded={expanded}
    >
      <SpeechIcon filled={expanded} />
      {count > 0 && (
        <span className="heart-count" style={{ pointerEvents: "none" }}>{compactCount(count)}</span>
      )}
    </button>
  );
}
