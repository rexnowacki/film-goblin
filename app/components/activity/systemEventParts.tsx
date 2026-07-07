// Shared presentational pieces for system feed rows. Deliberately NOT a
// client module: LandingFeedCard is a server component and must be able to
// call renderCopyText during server render — importing these from the
// "use client" SystemEventRow made them client references and crashed the
// landing page whenever a system row appeared (digest 2199110839).
import type { ReactNode } from "react";
import { stripLeadingEmoji } from "@/lib/feed-events/copy";

// copy contains **bold** markers from the templates — render them as <strong>.
export function renderCopyText(copy: string): ReactNode[] {
  return stripLeadingEmoji(copy).split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**")
      ? <strong key={i}>{seg.slice(2, -2)}</strong>
      : <span key={i}>{seg}</span>
  );
}

// The goblin's sigil occupies the avatar slot so system rows share the exact
// anatomy of user rows (see ActivityWatchlistAdded): avatar | text+footer | poster.
// SVG "FG" badge — same circular/void-border language as Avatar.tsx's
// initials fallback, so it reads as a sibling of user avatars, not a photo.
export function PitSigil({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "inline-block" }}
    >
      <circle cx="20" cy="20" r="18" fill="var(--accent)" stroke="var(--void)" strokeWidth="2" />
      <text
        x="20"
        y="21"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-ui)"
        fontWeight={900}
        fontSize="14"
        letterSpacing="0.02em"
        fill="var(--bone)"
      >
        FG
      </text>
    </svg>
  );
}
