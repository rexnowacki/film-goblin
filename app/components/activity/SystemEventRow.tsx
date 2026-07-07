"use client";

import Image from "next/image";
import Link from "next/link";
import type { SystemFeedEvent } from "@/lib/feed-events/types";
import { relativeTime } from "./relativeTime";
import { renderCopyText, PitSigil } from "./systemEventParts";

export default function SystemEventRow({ event }: { event: SystemFeedEvent }) {
  return (
    <div
      data-system-event={event.event_type}
      style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #2a2a2a" }}
    >
      <PitSigil size={36} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4, color: "var(--bone)" }}>
          {renderCopyText(event.copy, event.film?.id)}
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
