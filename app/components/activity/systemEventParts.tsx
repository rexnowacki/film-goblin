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
export function PitSigil({ size }: { size: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid #2a2a2a",
        color: "var(--muted)",
        fontSize: size * 0.5,
        lineHeight: 1,
      }}
    >
      ⛧
    </span>
  );
}
