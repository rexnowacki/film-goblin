"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import type { SystemFeedEvent } from "@/lib/feed-events/types";
import { relativeTime } from "./relativeTime";
import { renderCopyText, PitSeal } from "./systemEventParts";
import { getPitKicker, getPitPriceVars, getPitBadges, type PitTier } from "@/lib/feed-events/tier";
import { getPitDigestPayload } from "@/lib/feed-events/pitDigest";
import { recordPitImpressions } from "@/lib/actions/feed-events";

export default function SystemEventRow({
  event,
  tier,
  recordImpression = true,
}: {
  event: SystemFeedEvent;
  tier: PitTier;
  recordImpression?: boolean;
}) {
  const digest = getPitDigestPayload(event);

  useEffect(() => {
    if (!recordImpression) return;
    if (digest) {
      void recordPitImpressions(digest.memberIds, digest.digestKey);
    } else {
      void recordPitImpressions([event.id]);
    }
  }, [event.id, recordImpression]);

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
          style={{ display: "block", objectFit: "cover", border: "1px solid var(--pit-cream-dim)" }}
        />
      ) : (
        <span style={{ display: "block", width: 40, height: 60, background: "var(--pit-plum-line)", border: "1px solid var(--pit-cream-dim)" }} />
      )}
    </Link>
  ) : null;

  return (
    <div
      data-system-event={event.event_type}
      data-pit-tier={tier}
      className={`pit-row pit-${tier}`}
    >
      {tier !== "whisper" && <PitSeal size={40} />}
      <div style={{ flex: 1 }}>
        <div className="pit-kicker">FROM THE PIT · {kicker}</div>
        <div className="pit-copy" style={{ marginTop: 2 }}>
          {renderCopyText(event.copy, event.film?.id)}
        </div>
        {digest && (
          <>
            {digest.memberFilms.length > 0 && (
              <div className="pit-digest-films" aria-label={`${digest.memberCount} films in this omen`}>
                {digest.memberFilms.map((film) => (
                  <Link key={film.id} prefetch={false} href={`/film/${film.id}`} className="pit-digest-film">
                    {film.artwork_url ? (
                      <Image src={film.artwork_url} alt={film.title} width={32} height={48} />
                    ) : (
                      <span className="pit-digest-film-fallback" aria-label={film.title} />
                    )}
                  </Link>
                ))}
                {digest.memberCount > digest.memberFilms.length && (
                  <span className="chip">+{digest.memberCount - digest.memberFilms.length} more</span>
                )}
              </div>
            )}
            <Link prefetch={false} href="/home?tab=pit" className="pit-digest-see-all">
              See all <span aria-hidden="true">→</span>
            </Link>
          </>
        )}
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
          <span className="activity-footer-time" style={{ fontFamily: "var(--font-ui)", color: "var(--pit-cream-dim)" }}>
            {relativeTime(event.created_at)}
          </span>
        </div>
      </div>
      {tier !== "whisper" && poster}
    </div>
  );
}
