"use client";

import Link from "next/link";
import Avatar from "../Avatar";
import { relativeTime } from "../activity/relativeTime";
import type { EnrichedNotification } from "@/lib/queries/notifications";

interface Props {
  notification: EnrichedNotification;
  onNavigate?: () => void;
}

function targetFor(n: EnrichedNotification): string {
  switch (n.kind) {
    case "coven_invite_pending":
      return "/coven#requests";
    case "coven_invite_accepted":
      return n.actor ? `/p/${encodeURIComponent(n.actor.username)}` : "/coven";
    case "recommendation_received":
    case "price_drop": {
      const filmId = (n.payload as { film_id?: string }).film_id;
      return filmId ? `/film/${filmId}` : "/home";
    }
    case "comment_on_activity": {
      const activityId = (n.payload as { activity_id?: string }).activity_id;
      return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
    }
    case "like_on_comment": {
      const activityId = (n.payload as { activity_id?: string }).activity_id;
      return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
    }
    case "reply_on_comment": {
      const activityId = (n.payload as { activity_id?: string }).activity_id;
      return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
    }
    case "rate_reminder": {
      const watchedId = (n.payload as { watched_id?: string }).watched_id;
      return watchedId ? `/watched?rate=${encodeURIComponent(watchedId)}` : "/watched";
    }
  }
}

function copyFor(n: EnrichedNotification): React.ReactNode {
  const actorName = n.actor?.username ?? "Someone";
  const title = n.film?.title ?? "a film";
  switch (n.kind) {
    case "coven_invite_pending":
      return <><strong>{actorName}</strong> invited you to their coven.</>;
    case "coven_invite_accepted":
      return <><strong>{actorName}</strong> joined your coven.</>;
    case "recommendation_received":
      return <><strong>{actorName}</strong> recommended <em>{title}</em>.</>;
    case "price_drop": {
      const p = n.payload as { old_price_usd?: number; new_price_usd?: number };
      return <>Price drop: <em>{title}</em>{p.new_price_usd !== undefined ? ` — $${p.new_price_usd.toFixed(2)}` : ""}.</>;
    }
    case "comment_on_activity": {
      const raw = (n.payload as { body?: string }).body ?? "";
      const snippet = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
      const subject = n.film?.title ?? "your activity";
      return <><strong>{actorName}</strong> commented on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
    }
    case "like_on_comment": {
      const raw = (n.payload as { body?: string }).body ?? "";
      const snippet = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
      const subject = n.film?.title ?? "your activity";
      return <><strong>{actorName}</strong> liked your comment on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
    }
    case "reply_on_comment": {
      const raw = (n.payload as { body?: string }).body ?? "";
      const snippet = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
      const subject = n.film?.title ?? "your comment";
      return <><strong>{actorName}</strong> replied to your comment on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
    }
    case "rate_reminder": {
      const count = (n.payload as { unrated_count?: number }).unrated_count ?? 1;
      return count > 1
        ? <>You have <strong>{count}</strong> unrated watches. Tell the coven what you thought.</>
        : <>Got a verdict on <em>{title}</em>? Rate it for the coven.</>;
    }
  }
}

export default function NotificationRow({ notification, onNavigate }: Props) {
  const href = targetFor(notification);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      style={{
        display: "flex", gap: 10, padding: "10px 12px",
        borderBottom: "1px solid #2a2a2a",
        textDecoration: "none", color: "var(--bone)",
        background: notification.read_at ? "transparent" : "rgba(255,45,136,0.06)",
      }}
    >
      <Avatar
        name={notification.actor?.username ?? "system"}
        color="var(--accent)"
        size={32}
        url={notification.actor?.avatar_url ?? null}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, lineHeight: 1.35 }}>
          {copyFor(notification)}
        </div>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
          {relativeTime(notification.created_at)}
        </div>
      </div>
    </Link>
  );
}
