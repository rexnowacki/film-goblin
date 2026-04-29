"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Avatar from "../Avatar";
import ActivityWatchLogged from "./ActivityWatchLogged";
import { relativeTime } from "./relativeTime";
import type { ActivityGroup, EnrichedActivity } from "@/lib/queries/activity";

interface Props {
  group: ActivityGroup;
}

export default function ActivityWatchLoggedGroup({ group }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { actor, items, count, latestAt } = group;
  const firstItem = items[0] as Extract<EnrichedActivity, { kind: "watch_logged" }>;
  const othersCount = count - 1;
  const visiblePosters = items.slice(0, 3);
  const overflowCount = count - visiblePosters.length;

  function toggle() { setExpanded(v => !v); }

  return (
    <div className={expanded ? "activity-group-expanded" : ""}>
      <div className="activity-group-row" onClick={toggle} role="button" aria-expanded={expanded}>
        <Avatar
          name={actor.display_name ?? actor.handle}
          color="var(--accent)"
          size={40}
          url={actor.avatar_url}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
            <Link
              href={`/p/${encodeURIComponent(actor.handle)}`}
              onClick={e => e.stopPropagation()}
              style={{ color: "var(--bone)", fontWeight: 700 }}
            >
              {actor.display_name ?? actor.handle}
            </Link>
            {" watched "}
            <Link
              href={`/film/${firstItem.film.id}`}
              onClick={e => e.stopPropagation()}
              style={{ color: "var(--accent)", fontStyle: "italic" }}
            >
              {firstItem.film.title}
            </Link>
            {" and "}
            <strong style={{ color: "var(--accent)" }}>
              {othersCount} {othersCount === 1 ? "other film" : "other films"}
            </strong>
            {"."}
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
            <span>{relativeTime(latestAt)}</span>
            <span className="activity-group-chevron" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }} aria-hidden="true">
              ▾
            </span>
          </div>
        </div>
        <div className="activity-group-poster-stack">
          {visiblePosters.map((item, idx) => {
            const wlItem = item as Extract<EnrichedActivity, { kind: "watch_logged" }>;
            const isLast = idx === visiblePosters.length - 1;
            return (
              <div key={wlItem.id} style={{ position: "relative" }}>
                <Image src={wlItem.film.artwork_url} alt={wlItem.film.title} width={32} height={48} />
                {isLast && overflowCount > 0 && (
                  <span className="more-badge">+{overflowCount}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="activity-group-expanded-items" data-open={expanded}>
        {items.map(item => {
          const wlItem = item as Extract<EnrichedActivity, { kind: "watch_logged" }>;
          return <ActivityWatchLogged key={wlItem.id} item={wlItem} />;
        })}
      </div>
    </div>
  );
}
