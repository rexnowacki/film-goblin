"use client";

import { useEffect, useRef } from "react";
import BottomSheet from "./BottomSheet";
import NotificationRow from "./notifications/NotificationRow";
import NotificationGroupRow from "./notifications/NotificationGroupRow";
import type { NotificationFeedItem } from "@/lib/queries/notifications";

interface Props {
  open: boolean;
  onClose: () => void;
  items: NotificationFeedItem[];
  /** True if the viewport is mobile-width. Detected by parent via media-query on mount. */
  isMobile: boolean;
}

export default function NotificationsDropdown({ open, onClose, items, isMobile }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside on desktop only — BottomSheet handles its own backdrop on mobile.
  useEffect(() => {
    if (!open || isMobile) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, isMobile, onClose]);

  if (!open) return null;

  const body = (
    <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
      {items.length === 0 ? (
        <div style={{ padding: "16px 12px", fontStyle: "italic", color: "var(--muted)" }}>
          No notifications yet.
        </div>
      ) : (
        items.map(it =>
          it.type === "single"
            ? <NotificationRow key={it.notification.id} notification={it.notification} onNavigate={onClose} />
            : <NotificationGroupRow key={it.group.key} group={it.group} onNavigate={onClose} />
        )
      )}
    </div>
  );

  if (isMobile) {
    return <BottomSheet open={open} onClose={onClose} title="Notifications">{body}</BottomSheet>;
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Notifications"
      style={{
        position: "absolute",
        right: 0,
        top: "calc(100% + 8px)",
        background: "var(--void-2)",
        color: "var(--bone)",
        border: "2px solid var(--void)",
        boxShadow: "4px 4px 0 var(--accent)",
        width: 360,
        maxWidth: "calc(100vw - 24px)",
        zIndex: 50,
      }}
    >
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #2a2a2a", fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
        Notifications
      </div>
      {body}
    </div>
  );
}
