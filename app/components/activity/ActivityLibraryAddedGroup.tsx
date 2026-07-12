"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Avatar from "../Avatar";
import ActivityLibraryAdded from "./ActivityLibraryAdded";
import { relativeTime } from "./relativeTime";
import type { ActivityGroup, EnrichedActivity } from "@/lib/queries/activity";

interface Props {
  group: ActivityGroup;
}

export default function ActivityLibraryAddedGroup({ group }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { actor, items, count, latestAt } = group;
  const firstItem = items[0] as Extract<EnrichedActivity, { kind: "library_added" }>;
  const othersCount = count - 1;
  const visiblePosters = items.slice(0, 3);
  const overflowCount = count - visiblePosters.length;

  return (
    <div className={expanded ? "activity-group-expanded" : ""}>
      <div
        className="activity-group-row"
        onClick={() => setExpanded(value => !value)}
        role="button"
        aria-expanded={expanded}
      >
        <Avatar name={actor.username} color="var(--accent)" size={36} url={actor.avatar_url} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
            <Link
              prefetch={false}
              href={`/p/${encodeURIComponent(actor.username)}`}
              onClick={event => event.stopPropagation()}
              style={{ color: "var(--bone)", fontWeight: 700 }}
            >
              {actor.username}
            </Link>
            {" added "}
            <Link
              prefetch={false}
              href={`/film/${firstItem.film.id}`}
              onClick={event => event.stopPropagation()}
              style={{ color: "var(--accent)", fontStyle: "italic" }}
            >
              {firstItem.film.title}
            </Link>
            {" and "}
            <strong style={{ color: "var(--accent)" }}>
              {othersCount} {othersCount === 1 ? "other film" : "other films"}
            </strong>
            {" to their grimoire."}
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
            <span>{relativeTime(latestAt)}</span>
            <span
              className="activity-group-chevron"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
              aria-hidden="true"
            >
              ▾
            </span>
          </div>
        </div>
        <div className="activity-group-poster-stack">
          {visiblePosters.map((item, index) => {
            const libraryItem = item as Extract<EnrichedActivity, { kind: "library_added" }>;
            const isLast = index === visiblePosters.length - 1;
            return (
              <div key={libraryItem.id} style={{ position: "relative" }}>
                <Image src={libraryItem.film.artwork_url} alt={libraryItem.film.title} width={32} height={48} />
                {isLast && overflowCount > 0 && <span className="more-badge">+{overflowCount}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="activity-group-expanded-items" data-open={expanded}>
        {items.map(item => {
          const libraryItem = item as Extract<EnrichedActivity, { kind: "library_added" }>;
          return <ActivityLibraryAdded key={libraryItem.id} item={libraryItem} />;
        })}
      </div>
    </div>
  );
}
