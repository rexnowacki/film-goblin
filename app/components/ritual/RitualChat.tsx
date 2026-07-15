"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminDeleteRitualMessage, postRitualMessage, searchUsersForMention } from "@/lib/actions/ritual";
import type { RitualMessage } from "@/lib/queries/ritual";
import { RITUAL_MENTION_EVENT } from "@/lib/realtime/events";
import RitualMessageRow from "./RitualMessageRow";
import RitualComposer, { type MentionCandidate } from "./RitualComposer";

interface Props {
  pickId: number;
  archived: boolean;
  initialMessages: RitualMessage[];
  currentUserId: string | null;
  viewerUsername: string | null;
  viewerAvatarUrl: string | null;
  viewerDisplayName: string | null;
  viewerIsAdmin?: boolean;
  surface?: "page" | "sheet";
}

// Distance from the bottom (px) where we still consider the user "stuck to bottom"
// and auto-scroll on new messages instead of showing the new-messages pill.
const STICK_THRESHOLD_PX = 80;

export default function RitualChat({
  pickId,
  archived,
  initialMessages,
  currentUserId,
  viewerUsername,
  viewerAvatarUrl,
  viewerDisplayName,
  viewerIsAdmin = false,
  surface = "page",
}: Props) {
  const [messages, setMessages] = useState<RitualMessage[]>(initialMessages);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const requestedMessageId = searchParams.get("message");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isStuckRef = useRef(true);
  const profileCacheRef = useRef<Map<string, RitualMessage["author"]>>(
    new Map([
      ...initialMessages.map(m => [m.author.id, m.author] as const),
      ...(currentUserId ? [[currentUserId, {
        id: currentUserId,
        username: viewerUsername ?? "you",
        display_name: viewerDisplayName,
        avatar_url: viewerAvatarUrl,
      }] as const] : []),
    ]),
  );

  // Track scroll position to decide auto-scroll vs unread badge.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      isStuckRef.current = distance < STICK_THRESHOLD_PX;
      if (isStuckRef.current) setUnreadBelow(0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Initial scroll to bottom on mount.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    isStuckRef.current = true;
  }, []);

  // After new messages append, either stick or count as unread.
  const lastCount = useRef(initialMessages.length);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const grew = messages.length > lastCount.current;
    lastCount.current = messages.length;
    if (!grew) return;
    if (isStuckRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setUnreadBelow(n => n + 1);
    }
  }, [messages]);

  useEffect(() => {
    if (!requestedMessageId) return;
    setActiveHighlightId(requestedMessageId);
  }, [requestedMessageId]);

  useEffect(() => {
    if (!activeHighlightId) return;
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(activeHighlightId)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = window.setTimeout(() => setActiveHighlightId(id => id === activeHighlightId ? null : id), 4500);
    return () => window.clearTimeout(t);
  }, [activeHighlightId, messages]);

  const upsertMessage = useCallback((row: RitualMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === row.id)) return prev;
      // Replace optimistic temp by best-effort match (same author + body + within 30s)
      const idx = prev.findIndex(
        m => m.id.startsWith("temp-") && m.author.id === row.author.id && m.body === row.body,
      );
      if (idx !== -1) {
        const next = prev.slice();
        next[idx] = row;
        return next;
      }
      return [...prev, row];
    });
    if (!profileCacheRef.current.has(row.author.id)) {
      profileCacheRef.current.set(row.author.id, row.author);
    }
  }, []);

  const removeMessage = useCallback((messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
    setFailedIds(prev => {
      if (!prev.has(messageId)) return prev;
      const next = new Set(prev);
      next.delete(messageId);
      return next;
    });
  }, []);

  // Realtime subscription. Only active threads accept new messages, but we
  // subscribe even on archived views so a user reading history sees nothing
  // unexpected appear (no-op subscription).
  useEffect(() => {
    if (archived) return;
    let cancelled = false;
    const supabase = createClient();

    async function fetchRecentMessages() {
      const { data } = await supabase
        .from("goblin_pick_messages")
        .select("id, pick_id, body, mentions, created_at, profiles!user_id(id, username, display_name, avatar_url)")
        .eq("pick_id", pickId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (cancelled || !data) return;
      for (const row of data) {
        if (!row.profiles) continue;
        const author = row.profiles as unknown as RitualMessage["author"];
        profileCacheRef.current.set(author.id, author);
        upsertMessage({
          id: row.id,
          pick_id: row.pick_id,
          body: row.body,
          mentions: row.mentions ?? [],
          created_at: row.created_at,
          author,
        });
      }
    }

    const channel = supabase
      .channel(`ritual-${pickId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "goblin_pick_messages", filter: `pick_id=eq.${pickId}` },
        async (payload) => {
          const row = payload.new as {
            id: string;
            pick_id: number;
            user_id: string;
            body: string;
            mentions: string[] | null;
            created_at: string;
          };

          let author = profileCacheRef.current.get(row.user_id) ?? null;
          if (!author) {
            const { data } = await supabase
              .from("profiles")
              .select("id, username, display_name, avatar_url")
              .eq("id", row.user_id)
              .maybeSingle();
            if (!data) return;
            author = data;
            profileCacheRef.current.set(author.id, author);
          }

          upsertMessage({
            id: row.id,
            pick_id: row.pick_id,
            body: row.body,
            mentions: row.mentions ?? [],
            created_at: row.created_at,
            author,
          });

          if (
            currentUserId
            && row.user_id !== currentUserId
            && (row.mentions ?? []).includes(currentUserId)
          ) {
            window.dispatchEvent(new CustomEvent(RITUAL_MENTION_EVENT, {
              detail: {
                messageId: row.id,
                pickId,
                actorUsername: author.username,
                body: row.body,
              },
            }));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "goblin_pick_messages" },
        (payload) => {
          const row = payload.old as { id?: string };
          if (row.id) removeMessage(row.id);
        },
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED") {
          console.info("[realtime] ritual chat subscribed", { pickId });
          void fetchRecentMessages();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[realtime] ritual chat subscription issue", { pickId, status });
          window.setTimeout(() => { if (!cancelled) void fetchRecentMessages(); }, 1000);
        }
      });

    function refreshOnReturn() {
      if (document.visibilityState === "visible") void fetchRecentMessages();
    }
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      supabase.removeChannel(channel);
    };
  }, [archived, currentUserId, pickId, removeMessage, upsertMessage]);

  const handleSend = useCallback(async (body: string) => {
    if (!currentUserId) return;
    const me = profileCacheRef.current.get(currentUserId);
    const tempId = `temp-${Math.random().toString(36).slice(2)}`;
    const tempMsg: RitualMessage = {
      id: tempId,
      pick_id: pickId,
      body,
      mentions: [],
      created_at: new Date().toISOString(),
      author: me ?? { id: currentUserId, username: "you", display_name: null, avatar_url: null },
    };
    // Force-stick on send so the user sees their own message land at the bottom.
    isStuckRef.current = true;
    setMessages(prev => [...prev, tempMsg]);

    const res = await postRitualMessage(body);
    if (!res.ok) {
      setFailedIds(prev => new Set(prev).add(tempId));
      return;
    }
    // Replace temp with confirmed row. Realtime will also fire — upsertMessage
    // dedupes on id, so whichever path lands first wins and the other is a no-op.
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === tempId);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = {
        ...tempMsg,
        id: res.message.id,
        mentions: res.message.mentions,
        created_at: res.message.created_at,
      };
      return next;
    });
    setFailedIds(prev => {
      if (!prev.has(tempId)) return prev;
      const next = new Set(prev);
      next.delete(tempId);
      return next;
    });
  }, [currentUserId, pickId]);

  const retryMessage = useCallback((message: RitualMessage) => {
    setMessages(prev => prev.filter(m => m.id !== message.id));
    setFailedIds(prev => {
      if (!prev.has(message.id)) return prev;
      const next = new Set(prev);
      next.delete(message.id);
      return next;
    });
    void handleSend(message.body);
  }, [handleSend]);

  const deleteMessage = useCallback(async (message: RitualMessage) => {
    if (!viewerIsAdmin || message.id.startsWith("temp-")) return;
    if (!window.confirm(`Delete this ritual message from ${message.author.username}?`)) return;
    const previous = messages;
    removeMessage(message.id);
    const res = await adminDeleteRitualMessage(message.id);
    if (!res.ok) {
      setMessages(previous);
      window.alert(`Delete failed: ${res.error}`);
    }
  }, [messages, removeMessage, viewerIsAdmin]);

  const lookupMentions = useCallback(async (prefix: string): Promise<MentionCandidate[]> => {
    const data = await searchUsersForMention(prefix);
    return data.map(d => ({ id: d.id, username: d.username, display_name: d.display_name }));
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    isStuckRef.current = true;
    setUnreadBelow(0);
  }, []);

  const isEmpty = messages.length === 0;
  const framed = surface === "page";

  // Day-grouping for IRC-style date dividers between message blocks.
  const grouped = useMemo(() => groupByDay(messages), [messages]);

  return (
    <div
      style={{
        display: "flex", flexDirection: "column",
        flex: 1,
        minHeight: 0,
        border: framed ? "1px solid #2a2a2a" : 0,
        background: framed ? "var(--void-2, #141414)" : "transparent",
        position: "relative",
      }}
    >
      <div
        ref={scrollerRef}
        style={{ flex: 1, overflowY: "auto", padding: "12px 0", scrollBehavior: "auto" }}
      >
        {isEmpty ? (
          <div style={{
            height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            padding: 32, textAlign: "center",
          }}>
            <div>
              <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8, letterSpacing: "0.14em" }}>
                Silence in the circle
              </div>
              <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", maxWidth: 280, lineHeight: 1.55 }}>
                {archived
                  ? "No incantations were spoken during this watch."
                  : "Be the first to summon. Type below."}
              </p>
            </div>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.dayKey}>
              <DayDivider label={group.label} />
              {group.messages.map((m, i) => {
                const prev = i > 0 ? group.messages[i - 1] : null;
                const compact = prev != null
                  && prev.author.id === m.author.id
                  && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 4 * 60 * 1000;
                return (
                  <RitualMessageRow
                    key={m.id}
                    message={m}
                    compact={compact}
                    isMe={m.author.id === currentUserId}
                    highlighted={m.id === activeHighlightId}
                    failed={failedIds.has(m.id)}
                    onRetry={() => retryMessage(m)}
                    canModerate={viewerIsAdmin}
                    onDelete={() => deleteMessage(m)}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>

      {unreadBelow > 0 && (
        <button
          type="button"
          onClick={scrollToBottom}
          style={{
            position: "absolute", bottom: 64, left: "50%", transform: "translateX(-50%)",
            background: "var(--accent)", color: "var(--accent-ink)",
            border: "none", padding: "6px 14px",
            fontFamily: "var(--font-ui)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
            cursor: "pointer", textTransform: "uppercase",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            zIndex: 1,
          }}
        >
          ↓ {unreadBelow} new
        </button>
      )}

      {archived ? (
        <ArchivedFooter />
      ) : currentUserId ? (
        <RitualComposer
          onSend={handleSend}
          lookupMentions={lookupMentions}
          viewerAvatarUrl={viewerAvatarUrl}
          viewerDisplayName={viewerDisplayName}
        />
      ) : (
        <SignInFooter />
      )}
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 18px 8px",
      fontFamily: "var(--font-ui)", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
      color: "var(--muted)", textTransform: "uppercase",
    }}>
      <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
      <span>{label}</span>
      <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
    </div>
  );
}

function ArchivedFooter() {
  return (
    <div style={{
      borderTop: "1px solid #2a2a2a", padding: "12px 16px",
      fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)",
      textAlign: "center",
    }}>
      The watch is over. The circle has dispersed.
    </div>
  );
}

function SignInFooter() {
  return (
    <div style={{
      borderTop: "1px solid #2a2a2a", padding: "14px 16px",
      fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--muted)",
      textAlign: "center",
    }}>
      <Link href="/auth/signin?redirect=/ritual" style={{ color: "var(--accent)", textDecoration: "none" }}>
        Sign in
      </Link>{" "}to join the ritual.
    </div>
  );
}

function groupByDay(messages: RitualMessage[]): { dayKey: string; label: string; messages: RitualMessage[] }[] {
  const out: { dayKey: string; label: string; messages: RitualMessage[] }[] = [];
  for (const m of messages) {
    const d = new Date(m.created_at);
    const key = d.toDateString();
    let bucket = out[out.length - 1];
    if (!bucket || bucket.dayKey !== key) {
      bucket = { dayKey: key, label: dayLabel(d), messages: [] };
      out.push(bucket);
    }
    bucket.messages.push(m);
  }
  return out;
}

function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
