"use client";

import { compactCount } from "@/lib/format";

interface Props {
  count: number;
  open: boolean;
  onOpen: () => void;
}

function SpeechIcon({ fill }: { fill: "accent" | "bone" | "none" }) {
  // Simple speech bubble — sharp corners + miter joins to match HeartIcon.
  const color = fill === "accent" ? "var(--accent)" : fill === "bone" ? "var(--bone)" : "var(--muted)";
  return (
    <svg viewBox="0 0 18 16" width="16" height="14" aria-hidden="true">
      <path
        d="M2 2 L16 2 L16 11 L9 11 L5 14 L5 11 L2 11 Z"
        fill={fill === "none" ? "none" : color}
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export default function CommentButton({ count, open, onOpen }: Props) {
  const iconFill = open ? "accent" : count > 0 ? "bone" : "none";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`heart-btn ${open ? "heart-liked" : ""}`}
      aria-label="Open comments"
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <SpeechIcon fill={iconFill} />
      {count > 0 && (
        <span className="heart-count" style={{ pointerEvents: "none" }}>{compactCount(count)}</span>
      )}
    </button>
  );
}
