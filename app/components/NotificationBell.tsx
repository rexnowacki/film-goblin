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

  // Sync optimistic count from SSR — but only while the dropdown is closed.
  // The markAllRead action revalidates layout-level data, which would zero
  // the badge out from under the user while they're still browsing the open
  // dropdown. Hold the count steady until they close it.
  useEffect(() => {
    if (!open) setOptimisticUnread(unreadCount);
  }, [unreadCount, open]);

  // Detect mobile-width once per mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 720px)");
    setIsMobile(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  async function onClick() {
    if (open) return;
    setOpen(true);
    if (optimisticUnread > 0) {
      try { await markAllRead(); } catch { /* swallow — server-side error handled by action */ }
    }
  }

  function onClose() {
    setOpen(false);
    // Zero the badge immediately on close so the bell unmounts snappily
    // regardless of whether the post-markAllRead revalidate has completed.
    setOptimisticUnread(0);
  }

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        onClick={onClick}
        aria-label={optimisticUnread > 0 ? `Open notifications (${optimisticUnread} unread)` : "Open notifications"}
        style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", display: "inline-flex" }}
      >
        <NotificationBadge count={optimisticUnread} />
      </button>
      <NotificationsDropdown
        open={open}
        onClose={onClose}
        items={items}
        isMobile={isMobile}
      />
    </div>
  );
}
