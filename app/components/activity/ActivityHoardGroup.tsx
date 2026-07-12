"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Avatar from "../Avatar";
import ActivityLibraryAdded from "./ActivityLibraryAdded";
import ActivityWatchlistAdded from "./ActivityWatchlistAdded";
import { relativeTime } from "./relativeTime";
import type { ActivityGroup, EnrichedActivity } from "@/lib/queries/activity";

type WatchlistItem = Extract<EnrichedActivity, { kind: "watchlist_added" }>;
type LibraryItem = Extract<EnrichedActivity, { kind: "library_added" }>;

export default function ActivityHoardGroup({ group }: { group: ActivityGroup }) {
  const [expanded, setExpanded] = useState(false);
  const watchlistItems = group.items.filter((item): item is WatchlistItem => item.kind === "watchlist_added");
  const libraryItems = group.items.filter((item): item is LibraryItem => item.kind === "library_added");
  const visiblePosters = group.items.slice(0, 3) as Array<WatchlistItem | LibraryItem>;
  const overflowCount = group.count - visiblePosters.length;

  const summary = watchlistItems.length > 0 && libraryItems.length > 0
    ? ` added ${watchlistItems.length} ${watchlistItems.length === 1 ? "film" : "films"} to their watchlist and ${libraryItems.length} ${libraryItems.length === 1 ? "film" : "films"} to their grimoire.`
    : watchlistItems.length > 0
      ? ` added ${watchlistItems.length} ${watchlistItems.length === 1 ? "film" : "films"} to their watchlist.`
      : ` added ${libraryItems.length} ${libraryItems.length === 1 ? "film" : "films"} to their grimoire.`;

  return (
    <div className={expanded ? "activity-group-expanded" : ""}>
      <div
        className="activity-group-row"
        onClick={() => setExpanded(value => !value)}
        role="button"
        aria-expanded={expanded}
      >
        <Avatar name={group.actor.username} color="var(--accent)" size={36} url={group.actor.avatar_url} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
            <Link
              prefetch={false}
              href={`/p/${encodeURIComponent(group.actor.username)}`}
              onClick={event => event.stopPropagation()}
              style={{ color: "var(--bone)", fontWeight: 700 }}
            >
              {group.actor.username}
            </Link>
            {summary}
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
            <span>{relativeTime(group.latestAt)}</span>
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
          {visiblePosters.map((item, index) => (
            <div key={item.id} style={{ position: "relative" }}>
              <Image src={item.film.artwork_url} alt={item.film.title} width={32} height={48} />
              {index === visiblePosters.length - 1 && overflowCount > 0 && (
                <span className="more-badge">+{overflowCount}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="activity-group-expanded-items" data-open={expanded}>
        {watchlistItems.length > 0 && (
          <section>
            <div className="caps" style={{ padding: "12px 0 2px", color: "var(--accent)", fontSize: 10 }}>
              Watchlist · {watchlistItems.length}
            </div>
            {watchlistItems.map(item => <ActivityWatchlistAdded key={item.id} item={item} />)}
          </section>
        )}
        {libraryItems.length > 0 && (
          <section>
            <div className="caps" style={{ padding: "12px 0 2px", color: "var(--accent)", fontSize: 10 }}>
              Grimoire · {libraryItems.length}
            </div>
            {libraryItems.map(item => <ActivityLibraryAdded key={item.id} item={item} />)}
          </section>
        )}
      </div>
    </div>
  );
}
