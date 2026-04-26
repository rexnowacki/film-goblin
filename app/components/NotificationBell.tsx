"use client";

import { useEffect, useRef, useState } from "react";
import NotificationBadge from "./NotificationBadge";
import NotificationsDropdown from "./NotificationsDropdown";
import { markAllRead } from "@/lib/actions/notifications";
import type { NotificationFeedItem } from "@/lib/queries/notifications";

interface Props {
  unreadCount: number;
  items: NotificationFeedItem[];
}

export default function NotificationBell({ unreadCount, items }: Props) {
  const [open, setOpen] = useState(false);
  const [optimisticUnread, setOptimisticUnread] = useState(unreadCount);
  const [isMobile, setIsMobile] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync optimistic count when SSR'd value changes (e.g. after revalidation).
  useEffect(() => { setOptimisticUnread(unreadCount); }, [unreadCount]);

  // Detect mobile-width once per mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 720px)");
    setIsMobile(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  if (optimisticUnread <= 0) return null;

  async function onClick() {
    if (open) return;
    setOpen(true);
    if (optimisticUnread > 0) {
      setOptimisticUnread(0);
      try { await markAllRead(); } catch { /* swallow — server-side error handled by action */ }
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        onClick={onClick}
        aria-label={`Open notifications (${optimisticUnread} unread)`}
        style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", display: "inline-flex" }}
      >
        <NotificationBadge count={optimisticUnread} />
      </button>
      <NotificationsDropdown
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        isMobile={isMobile}
      />
    </div>
  );
}
