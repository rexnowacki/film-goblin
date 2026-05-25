"use client";

import Link from "next/link";
import { useState } from "react";
import Avatar from "../ui/Avatar";
import NotificationRow from "./NotificationRow";
import { relativeTime } from "../activity/relativeTime";
import type { NotificationGroup } from "@/lib/queries/notifications";

interface Props {
  group: NotificationGroup;
  onNavigate?: () => void;
}

function headerCopy(group: NotificationGroup): React.ReactNode {
  const actorName = group.actor?.username ?? "System";
  switch (group.kind) {
    case "recommendation_received":
      return <><strong>{actorName}</strong> recommended <strong>{group.count} films</strong>.</>;
    case "price_drop":
      return <><strong>{group.count} watchlisted films</strong> dropped in price.</>;
    case "coven_invite_pending":
      return <><strong>{actorName}</strong> sent you {group.count} coven invites.</>;
    case "coven_invite_accepted":
      return <><strong>{actorName}</strong> accepted {group.count} coven invites.</>;
    case "comment_on_activity":
      return <><strong>{actorName}</strong> left {group.count} comments on your activity.</>;
    case "like_on_comment": {
      const raw = (group.items[0].payload as { body?: string }).body ?? "";
      const snippet = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
      const subject = group.items[0].film?.title ?? "your activity";
      return <><strong>{group.count} people</strong> liked your comment on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
    }
    case "reply_on_comment": {
      const raw = (group.items[0].payload as { body?: string }).body ?? "";
      const snippet = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
      const subject = group.items[0].film?.title ?? "your comment";
      return <><strong>{group.count} people</strong> replied to your comment on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
    }
    case "rate_reminder":
      return <>You have <strong>{group.count}</strong> pending rate reminders.</>;
    case "theater_showing_match":
      return <><strong>{group.count} local haunts</strong> matched your Hoard.</>;
    case "film_request_fulfilled":
      return <><strong>{group.count} film requests</strong> were fulfilled.</>;
    case "goblin_summon":
      return <><strong>{actorName}</strong> summoned you {group.count} times in the weekly ritual watch thread.</>;
  }
}

function headerHref(group: NotificationGroup): string {
  const first = group.items[0];
  switch (group.kind) {
    case "coven_invite_pending":
      return "/coven#requests";
    case "coven_invite_accepted":
      return group.actor ? `/p/${encodeURIComponent(group.actor.username)}` : "/coven";
    case "recommendation_received":
    case "price_drop": {
      const filmId = (first.payload as { film_id?: string }).film_id;
      return filmId ? `/film/${filmId}` : "/home";
    }
    case "comment_on_activity": {
      const activityId = (first.payload as { activity_id?: string }).activity_id;
      return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
    }
    case "like_on_comment": {
      const activityId = (first.payload as { activity_id?: string }).activity_id;
      return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
    }
    case "reply_on_comment": {
      const activityId = (first.payload as { activity_id?: string }).activity_id;
      return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
    }
    case "rate_reminder":
      return "/watched";
    case "theater_showing_match": {
      const showingId = (first.payload as { showing_id?: string }).showing_id;
      return showingId ? `/local-haunts/${encodeURIComponent(showingId)}` : "/home";
    }
    case "film_request_fulfilled": {
      const filmId = (first.payload as { film_id?: string }).film_id;
      return filmId ? `/film/${filmId}` : "/home";
    }
    case "goblin_summon": {
      const pickId = (first.payload as { pick_id?: number }).pick_id;
      return pickId ? `/ritual/${pickId}` : "/ritual";
    }
  }
}

export default function NotificationGroupRow({ group, onNavigate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const anyUnread = group.items.some(i => !i.read_at);

  function onToggle(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("a") && !(e.target as HTMLElement).hasAttribute("data-toggle")) return;
    setExpanded(v => !v);
  }

  return (
    <div style={{ borderBottom: "1px solid #2a2a2a" }}>
      <div
        onClick={onToggle}
        role="button"
        aria-expanded={expanded}
        style={{
          display: "flex", gap: 10, padding: "10px 12px",
          cursor: "pointer",
          background: anyUnread ? "rgba(255,45,136,0.06)" : "transparent",
        }}
      >
        <Avatar
          name={group.actor?.username ?? "system"}
          color="var(--accent)"
          size={32}
          url={group.actor?.avatar_url ?? null}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, lineHeight: 1.35 }}>
            {headerCopy(group)}
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)", marginTop: 2, display: "flex", gap: 10, alignItems: "center" }}>
            <span>{relativeTime(group.latestAt)}</span>
            <Link
              prefetch={false}
              href={headerHref(group)}
              data-toggle="false"
              onClick={onNavigate}
              style={{ color: "var(--accent)" }}
            >
              View
            </Link>
            <span style={{ marginLeft: "auto", transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }} aria-hidden="true">▾</span>
          </div>
        </div>
      </div>
      {expanded && (
        <div style={{ background: "rgba(0,0,0,0.25)" }}>
          {group.items.map(item => (
            <NotificationRow key={item.id} notification={item} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
