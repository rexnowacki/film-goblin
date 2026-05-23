"use client";

import Link from "next/link";
import Avatar from "../Avatar";
import { relativeTime } from "../activity/relativeTime";
import type { EnrichedNotification } from "@/lib/queries/notifications";
import { notificationRichCopy, notificationTarget } from "@/lib/notifications/display";

interface Props {
  notification: EnrichedNotification;
  onNavigate?: () => void;
}

export default function NotificationRow({ notification, onNavigate }: Props) {
  const href = notificationTarget(notification);
  return (
    <Link
      prefetch={false}
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
          {notificationRichCopy(notification)}
        </div>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
          {relativeTime(notification.created_at)}
        </div>
      </div>
    </Link>
  );
}
