"use client";

import Image from "next/image";
import Link from "next/link";
import type { SystemFeedEvent } from "@/lib/feed-events/types";
import { relativeTime } from "./relativeTime";
import { renderCopyText, PitSeal } from "./systemEventParts";
import { getPitKicker, getPitPriceVars, getPitBadges, type PitTier } from "@/lib/feed-events/tier";

export default function SystemEventRow({ event, tier }: { event: SystemFeedEvent; tier: PitTier }) {
  const kicker = getPitKicker(event, tier);
  const { price, oldPrice } = getPitPriceVars(event);
  const badges = tier === "standard" ? getPitBadges(event) : [];

  const poster = event.film ? (
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
  ) : null;

  return (
    <div
      data-system-event={event.event_type}
      data-pit-tier={tier}
      className={`pit-row pit-${tier}`}
      style={{ borderBottom: tier === "whisper" ? undefined : "1px solid #2a2a2a", padding: tier === "whisper" ? undefined : "12px 0" }}
    >
      {tier !== "whisper" && <PitSeal size={40} />}
      <div style={{ flex: 1 }}>
        <div className="pit-kicker">FROM THE PIT · {kicker}</div>
        <div className="pit-copy" style={{ marginTop: 2 }}>
          {renderCopyText(event.copy, event.film?.id)}
        </div>
        {tier === "full" && price != null && oldPrice != null && (
          <div className="pit-price-chip">
            <span>${price.toFixed(2)}</span>
            <span className="pit-price-old">was ${oldPrice.toFixed(2)}</span>
          </div>
        )}
        {badges.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {badges.map((b, i) => (
              <span key={i} className={b.filled ? "chip chip-filled" : "chip"}>{b.label}</span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 4 }}>
          <span className="activity-footer-time" style={{ fontFamily: "var(--font-ui)", color: "var(--muted)" }}>
            {relativeTime(event.created_at)}
          </span>
        </div>
      </div>
      {tier !== "whisper" && poster}
    </div>
  );
}
