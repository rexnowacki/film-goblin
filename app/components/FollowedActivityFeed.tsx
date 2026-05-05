"use client";

import Link from "next/link";
import Avatar from "@/components/Avatar";
import FilmPoster from "@/components/FilmPoster";
import type { EnrichedActivity } from "@/lib/queries/activity";

function activityLine(item: EnrichedActivity): string {
  switch (item.kind) {
    case "watchlist_added":     return `eyeing ${item.film.title}`;
    case "watch_logged":        return `watched ${item.film.title}`;
    case "library_added":       return `owns ${item.film.title}`;
    case "recommendation_sent": return `recommended ${item.film.title}`;
    case "review_published":    return `reviewed ${item.film.title}`;
    case "list_created":        return `created "${item.list.title}"`;
    case "list_film_added":     return `added ${item.film.title} to a list`;
    case "coven_joined":        return `joined a coven`;
    default:                    return "";
  }
}

function filmFromItem(item: EnrichedActivity): { id: string; title: string; director: string; year: number; artwork_url?: string | null } | null {
  if ("film" in item) return item.film;
  return null;
}

interface Props {
  items: EnrichedActivity[];
}

export default function FollowedActivityFeed({ items }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map(item => {
        const film = filmFromItem(item);
        return (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #1a1a1a" }}>
            <Link href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ flexShrink: 0 }}>
              <Avatar name={item.actor.username} color="var(--accent)" size={28} url={item.actor.avatar_url} />
            </Link>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--bone)", flex: 1, minWidth: 0 }}>
              <Link href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                {item.actor.username}
              </Link>
              {" "}
              <span style={{ color: "var(--muted)" }}>{activityLine(item)}</span>
            </span>
            {film && (
              <Link href={`/film/${film.id}`} style={{ flexShrink: 0 }}>
                <FilmPoster film={film} size="xs" style={{ width: 28, height: 42, borderRadius: 2 }} />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
