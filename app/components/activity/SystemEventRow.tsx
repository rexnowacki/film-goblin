"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { SystemFeedEvent } from "@/lib/feed-events/types";
import { stripLeadingEmoji } from "@/lib/feed-events/copy";
import { relativeTime } from "./relativeTime";

// copy contains **bold** markers from the templates — render them as <strong>.
// Exported so LandingFeedCard can reuse it for its own "system" row kind
// rather than re-implementing the same bold-splitting regex.
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

export default function SystemEventRow({ event }: { event: SystemFeedEvent }) {
  return (
    <div
      data-system-event={event.event_type}
      style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #2a2a2a" }}
    >
      <PitSigil size={36} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4, color: "var(--bone)" }}>
          {renderCopyText(event.copy)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span className="caps" style={{ fontSize: 9, letterSpacing: "0.14em", color: "var(--accent)" }}>
            From the Pit
          </span>
          <span className="activity-footer-time" style={{ fontFamily: "var(--font-ui)", color: "var(--muted)" }}>
            {relativeTime(event.created_at)}
          </span>
        </div>
      </div>
      {event.film ? (
        <Link prefetch={false} href={`/film/${event.film.id}`}>
          {event.film.artwork_url ? (
            <Image
              src={event.film.artwork_url}
              alt={event.film.title}
              width={40}
              height={60}
              style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }}
            />
          ) : (
            <span style={{ display: "block", width: 40, height: 60, background: "var(--void-3, #1a1a1a)", border: "1px solid var(--void)" }} />
          )}
        </Link>
      ) : null}
    </div>
  );
}
