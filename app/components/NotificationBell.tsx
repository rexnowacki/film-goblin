"use client";

import { useEffect, useRef, useState } from "react";
import NotificationBadge from "./ui/NotificationBadge";
import NotificationsDropdown from "./NotificationsDropdown";
import { markAllRead, clearAllNotifications } from "@/lib/actions/notifications";
import { createClient } from "@/lib/supabase/client";
import type { EnrichedNotification, NotificationFeedItem } from "@/lib/queries/notifications";
import { useToast } from "./ToastProvider";
import type { Database } from "@/lib/supabase/types";
import { notificationTarget, notificationToastText } from "@/lib/notifications/display";
import { RITUAL_MENTION_EVENT, type RitualMentionEventDetail } from "@/lib/realtime/events";

interface Props {
  userId: string | null;
  unreadCount: number;
  items: NotificationFeedItem[];
}

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
const MENTION_TOAST_DURATION_MS = 5000;

function snippet(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.length > max ? raw.slice(0, max - 1) + "..." : raw;
}

function findNotification(items: NotificationFeedItem[], id: string): EnrichedNotification | null {
  for (const item of items) {
    if (item.type === "single" && item.notification.id === id) return item.notification;
    if (item.type === "group") {
      const match = item.group.items.find(n => n.id === id);
      if (match) return match;
    }
  }
  return null;
}

function toastCopy(row: NotificationRow, items: NotificationFeedItem[]): string {
  const enriched = findNotification(items, row.id);
  if (enriched) return notificationToastText(enriched);
  const actor = "Someone";
  const payload = (row.payload ?? {}) as Record<string, unknown>;

  switch (row.kind) {
    case "goblin_summon": {
      const body = snippet(payload.body, 72);
      return body
        ? `${actor} mentioned you in ritual chat: "${body}"`
        : `${actor} mentioned you in ritual chat`;
    }
    case "comment_on_activity":
      return `${actor} commented on your activity`;
    case "reply_on_comment":
      return `${actor} replied to your comment`;
    case "like_on_comment":
      return `${actor} liked your comment`;
    case "recommendation_received":
      return `${actor} sent you a recommendation`;
    case "coven_invite_pending":
      return `${actor} invited you to their coven`;
    case "coven_invite_accepted":
      return `${actor} joined your coven`;
    case "price_drop":
      return "New price drop notification";
    case "rate_reminder":
      return "New rating reminder";
    case "theater_showing_match":
      return "A film from your Hoard found a screen";
    case "film_request_fulfilled":
      return "A film request was fulfilled";
  }
}

function ritualMentionToastCopy(detail: RitualMentionEventDetail): string {
  const body = snippet(detail.body, 72);
  return body
    ? `${detail.actorUsername} mentioned you in ritual chat: "${body}"`
    : `${detail.actorUsername} mentioned you in ritual chat`;
}

export default function NotificationBell({ userId, unreadCount, items }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [optimisticUnread, setOptimisticUnread] = useState(unreadCount);
  const [optimisticItems, setOptimisticItems] = useState(items);
  const [isMobile, setIsMobile] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const optimisticItemsRef = useRef(optimisticItems);
  const toastedMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    optimisticItemsRef.current = optimisticItems;
  }, [optimisticItems]);

  // Sync optimistic items from SSR while the dropdown is closed (same
  // reasoning as the unread-count sync below).
  useEffect(() => {
    if (!open) setOptimisticItems(items);
  }, [items, open]);

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

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const supabase = createClient();

    async function refresh() {
      try {
        const res = await fetch("/api/notifications/recent", { cache: "no-store" });
        if (!res.ok || cancelled) return null;
        const data = await res.json() as { unreadCount: number; items: NotificationFeedItem[] };
        if (cancelled) return null;
        setOptimisticUnread(data.unreadCount);
        setOptimisticItems(data.items);
        return data;
      } catch {
        // Realtime should never make the bell noisy if the refresh endpoint fails.
        return null;
      }
    }

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        payload => {
          const row = payload.new as NotificationRow;
          setOptimisticUnread(count => Math.max(count + 1, 1));
          void refresh().then(data => {
            if (cancelled) return;
            const messageId = (row.payload as { message_id?: unknown } | null)?.message_id;
            if (typeof messageId === "string") {
              if (toastedMessageIdsRef.current.has(messageId)) return;
              toastedMessageIdsRef.current.add(messageId);
            }
            const enriched = findNotification(data?.items ?? optimisticItemsRef.current, row.id);
            toast(
              enriched ? notificationToastText(enriched) : toastCopy(row, data?.items ?? optimisticItemsRef.current),
              MENTION_TOAST_DURATION_MS,
              enriched ? { href: notificationTarget(enriched) } : undefined,
            );
          });
        },
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED") {
          console.info("[realtime] notifications subscribed");
          void refresh();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[realtime] notifications subscription issue", status);
          window.setTimeout(() => { if (!cancelled) void refresh(); }, 1000);
        }
      });

    function refreshOnReturn() {
      if (document.visibilityState === "visible") void refresh();
    }
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      supabase.removeChannel(channel);
    };
  }, [toast, userId]);

  useEffect(() => {
    if (!userId) return;
    async function refreshFromLocalMention(e: Event) {
      const detail = (e as CustomEvent<RitualMentionEventDetail>).detail;
      if (!detail?.messageId || toastedMessageIdsRef.current.has(detail.messageId)) return;
      toastedMessageIdsRef.current.add(detail.messageId);
      setOptimisticUnread(count => Math.max(count + 1, 1));
      toast(ritualMentionToastCopy(detail), MENTION_TOAST_DURATION_MS, {
        href: `/ritual/${detail.pickId}?message=${encodeURIComponent(detail.messageId)}`,
      });
      try {
        const res = await fetch("/api/notifications/recent", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as { unreadCount: number; items: NotificationFeedItem[] };
        setOptimisticUnread(data.unreadCount);
        setOptimisticItems(data.items);
      } catch {
        // The chat mention event is already visible; stale dropdown data can wait for the next refresh.
      }
    }
    window.addEventListener(RITUAL_MENTION_EVENT, refreshFromLocalMention);
    return () => window.removeEventListener(RITUAL_MENTION_EVENT, refreshFromLocalMention);
  }, [toast, userId]);

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

  async function onClear() {
    setOptimisticItems([]);
    setOptimisticUnread(0);
    setOpen(false);
    try { await clearAllNotifications(); } catch { /* swallow — server-side error handled by action */ }
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
        onClear={onClear}
        items={optimisticItems}
        isMobile={isMobile}
      />
    </div>
  );
}
