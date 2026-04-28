"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { relativeTime } from "./activity/relativeTime";
import { addActivityComment, deleteActivityComment } from "@/lib/actions/activity-comments";
import type { CommentItem } from "@/lib/queries/activity-comments";

interface Props {
  activityId: string;
  actorUserId: string;
  viewerId: string | null;
  initialItems: CommentItem[];
  onCountChange?: (n: number) => void;
  onPosted?: () => void;
  onCollapse?: () => void;
}

const MAX_LEN = 140;

export default function ActivityCommentThread({
  activityId, actorUserId, viewerId, initialItems, onCountChange, onPosted, onCollapse,
}: Props) {
  const [items, setItems] = useState<CommentItem[]>(initialItems);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const trimmed = draft.trim();
  const overLimit = trimmed.length > MAX_LEN;
  const canPost = trimmed.length > 0 && !overLimit && !pending && viewerId !== null;

  function postComment() {
    if (!canPost || !viewerId) return;
    setError(null);
    // Optimistic: append a temp row, swap with server row on success.
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: CommentItem = {
      id: tempId,
      user_id: viewerId,
      user: { handle: "...", display_name: null, avatar_url: null },
      body: trimmed,
      created_at: new Date().toISOString(),
    };
    setItems(prev => {
      const next = [...prev, optimistic];
      onCountChange?.(next.length);
      return next;
    });
    setDraft("");
    startTransition(async () => {
      const result = await addActivityComment(activityId, trimmed);
      if (result.ok) {
        setItems(prev => prev.map(c => c.id === tempId ? result.comment : c));
        onPosted?.();
      } else {
        setItems(prev => {
          const next = prev.filter(c => c.id !== tempId);
          onCountChange?.(next.length);
          return next;
        });
        setError(result.error);
      }
    });
  }

  function removeComment(id: string) {
    const prev = items;
    setItems(p => {
      const next = p.filter(c => c.id !== id);
      onCountChange?.(next.length);
      return next;
    });
    startTransition(async () => {
      const result = await deleteActivityComment(id);
      if (!result.ok) {
        setItems(prev);
        onCountChange?.(prev.length);
        setError(result.error);
      }
    });
  }

  return (
    <div className="comment-thread" style={{ marginTop: 10, borderLeft: "2px solid var(--accent)", paddingLeft: 12 }}>
      {onCollapse && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Hide comments"
            className="caps"
            style={{
              background: "transparent",
              border: "1px solid var(--muted)",
              color: "var(--muted)",
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 9,
              letterSpacing: "0.08em",
            }}
          >
            Hide
          </button>
        </div>
      )}
      <div style={{ maxHeight: "min(50vh, 240px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(c => {
          const canDelete = viewerId !== null && (viewerId === c.user_id || viewerId === actorUserId);
          return (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12 }}>
              <Avatar
                name={c.user.display_name ?? c.user.handle}
                color="var(--accent)"
                size={22}
                url={c.user.avatar_url}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  <Link href={`/p/${encodeURIComponent(c.user.handle)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>
                    @{c.user.handle}
                  </Link>{" "}
                  <span style={{ wordBreak: "break-word" }}>{c.body}</span>
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{relativeTime(c.created_at)}</div>
              </div>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => removeComment(c.id)}
                  aria-label="Delete comment"
                  className="caps"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--muted)",
                    color: "var(--muted)",
                    cursor: "pointer",
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 9,
                    letterSpacing: "0.08em",
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          );
        })}
      </div>
      {viewerId !== null && (
        <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && canPost) { e.preventDefault(); postComment(); } }}
            placeholder="Quick take…"
            maxLength={MAX_LEN + 1} // allow 141 to surface the over-limit state visibly
            style={{ flex: 1, fontSize: 12, padding: "6px 8px", background: "var(--void-2)", color: "var(--bone)", border: "1px solid var(--muted)" }}
          />
          <span style={{ fontSize: 10, color: overLimit ? "var(--accent)" : "var(--muted)", minWidth: 38, textAlign: "right" }}>
            {trimmed.length}/{MAX_LEN}
          </span>
          <button type="button" className="btn btn-sm" onClick={postComment} disabled={!canPost}>Post</button>
        </div>
      )}
      {error && <div style={{ marginTop: 6, fontSize: 11, color: "var(--accent)" }}>{error}</div>}
    </div>
  );
}
