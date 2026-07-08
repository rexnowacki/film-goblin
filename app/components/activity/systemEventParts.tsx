// Shared presentational pieces for system feed rows. Deliberately NOT a
// client module: LandingFeedCard is a server component and must be able to
// call renderCopyText during server render — importing these from the
// "use client" SystemEventRow made them client references and crashed the
// landing page whenever a system row appeared (digest 2199110839).
import type { ReactNode } from "react";
import Link from "next/link";
import { stripLeadingEmoji } from "@/lib/feed-events/copy";

// copy contains **bold** markers from the templates, always wrapping the
// film title (see lib/feed-events/copy.ts TEMPLATES — the only `**...**`
// segment in any template is `${v.title}`). When a filmId is available,
// render that segment as the same accent/italic film link user-activity
// rows use (see ActivityWatchlistAdded); otherwise fall back to <strong>
// (defensive — no template currently bolds anything without an attached
// film, but milestone events genuinely have none).
export function renderCopyText(copy: string, filmId?: string | null): ReactNode[] {
  return stripLeadingEmoji(copy).split(/(\*\*[^*]+\*\*)/g).map((seg, i) => {
    if (!(seg.startsWith("**") && seg.endsWith("**"))) {
      return <span key={i}>{seg}</span>;
    }
    const title = seg.slice(2, -2);
    return filmId ? (
      <Link
        key={i}
        prefetch={false}
        href={`/film/${filmId}`}
        style={{ color: "var(--accent)", fontStyle: "italic" }}
      >
        {title}
      </Link>
    ) : (
      <strong key={i}>{title}</strong>
    );
  });
}

// Wax-seal avatar for standard/full tier Pit rows (spec 2026-07-07).
// Flat 40 everywhere on /home; LandingFeedCard uses its own smaller size
// via the same component. Whisper tier renders no avatar at all — callers
// simply omit PitSeal rather than calling it with a tiny size.
export function PitSeal({ size }: { size: number }) {
  return (
    <img
      src="/pit-seal.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, display: "inline-block" }}
    />
  );
}
