"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { SystemFeedEvent } from "@/lib/feed-events/types";

// copy contains **bold** markers from the templates — render them as <strong>.
// Exported so LandingFeedCard can reuse it for its own "system" row kind
// rather than re-implementing the same bold-splitting regex.
export function renderCopyText(copy: string): ReactNode[] {
  return copy.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**")
      ? <strong key={i}>{seg.slice(2, -2)}</strong>
      : <span key={i}>{seg}</span>
  );
}

export default function SystemEventRow({ event }: { event: SystemFeedEvent }) {
  const body = (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1 }}>
      {event.film?.artwork_url ? (
        <Image
          src={event.film.artwork_url}
          alt={event.film.title}
          width={40}
          height={60}
          style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)", flexShrink: 0 }}
        />
      ) : null}
      <p style={{ margin: 0, fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4, color: "var(--muted)" }}>
        {renderCopyText(event.copy)}
      </p>
    </div>
  );
  return (
    <div
      data-system-event={event.event_type}
      style={{ display: "flex", padding: "12px 0", borderBottom: "1px solid #2a2a2a" }}
    >
      {event.film ? (
        <Link prefetch={false} href={`/film/${event.film.id}`} style={{ display: "flex", flex: 1, color: "inherit", textDecoration: "none" }}>
          {body}
        </Link>
      ) : body}
    </div>
  );
}
