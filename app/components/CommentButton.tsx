"use client";

import { compactCount } from "@/lib/format";

interface Props {
  count: number;
  open: boolean;
  onOpen: () => void;
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

export default function CommentButton({ count, open, onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`heart-btn ${open ? "heart-liked" : ""}`}
      aria-label="Open comments"
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <SpeechIcon filled={open} />
      {count > 0 && (
        <span className="heart-count" style={{ pointerEvents: "none" }}>{compactCount(count)}</span>
      )}
    </button>
  );
}
