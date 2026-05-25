"use client";

import { useState, useTransition } from "react";
import ThreadSheet from "./ThreadSheet";
import CommentList from "../CommentList";
import CommentComposer from "../CommentComposer";
import { addActivityComment, deleteActivityComment } from "@/lib/actions/activity-comments";
import type { CommentItem } from "@/lib/queries/activity-comments";

// ── pure helpers ────────────────────────────────────────────────

function buildChildrenMap(items: CommentItem[]): Map<string, CommentItem[]> {
  const map = new Map<string, CommentItem[]>();
  for (const item of items) {
    if (item.parent_id) {
      const arr = map.get(item.parent_id) ?? [];
      arr.push(item);
      map.set(item.parent_id, arr);
    }
  }
  return map;
}

function collectDescendants(id: string, items: CommentItem[]): Set<string> {
  const result = new Set<string>([id]);
  for (const item of items) {
    if (item.parent_id === id) {
      for (const desc of collectDescendants(item.id, items)) {
        result.add(desc);
      }
    }
  }
  return result;
}

// ── component ───────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  activityId: string;
  actorUserId: string;
  viewerId: string | null;
  viewerAvatarUrl: string | null;
  viewerDisplayName: string | null;
  initialItems: CommentItem[];
  onCountChange: (n: number) => void;
}

export default function CommentSheet({
  open, onClose, activityId, actorUserId,
  viewerId, viewerAvatarUrl, viewerDisplayName,
  initialItems, onCountChange,
}: Props) {
  const [items, setItems] = useState<CommentItem[]>(initialItems);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<{ commentId: string; username: string } | null>(null);

  const childrenMap = buildChildrenMap(items);

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function postComment(body: string) {
    if (!viewerId) return;
    setError(null);
    const parentId = replyTo?.commentId ?? null;
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: CommentItem = {
      id: tempId,
      user_id: viewerId,
      user: { username: "...", display_name: null, avatar_url: viewerAvatarUrl },
      body,
      created_at: new Date().toISOString(),
      like_count: 0,
      liked_by_me: false,
      parent_id: parentId,
      reply_count: 0,
    };
    setItems(prev => {
      const next = [...prev, optimistic];
      onCountChange(next.length);
      return next;
    });
    if (parentId) {
      setExpandedIds(prev => new Set([...prev, parentId]));
    }
    setReplyTo(null);
    startTransition(async () => {
      const result = await addActivityComment(activityId, body, parentId ?? undefined);
      if (result.ok) {
        setItems(prev => prev.map(c => c.id === tempId ? result.comment : c));
      } else {
        setItems(prev => {
          const next = prev.filter(c => c.id !== tempId);
          onCountChange(next.length);
          return next;
        });
        setError(result.error);
      }
    });
  }

  function removeComment(id: string) {
    const prev = items;
    setItems(p => {
      const toRemove = collectDescendants(id, p);
      const next = p.filter(c => !toRemove.has(c.id));
      onCountChange(next.length);
      return next;
    });
    startTransition(async () => {
      const result = await deleteActivityComment(id);
      if (!result.ok) {
        setItems(prev);
        onCountChange(prev.length);
        setError(result.error);
      }
    });
  }

  const title = (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
      <span>Comments</span>
      <span className="dot-accent">•</span>
      <span style={{ fontSize: 18, color: "var(--muted)", fontFamily: "var(--font-ui)", fontWeight: 400 }}>
        {items.length}
      </span>
    </span>
  );

  return (
    <ThreadSheet open={open} onClose={onClose} title={title}>
      <>
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
          <CommentList
            items={items}
            childrenMap={childrenMap}
            viewerId={viewerId}
            actorUserId={actorUserId}
            expandedIds={expandedIds}
            onExpand={toggleExpand}
            onReply={(commentId, username) => setReplyTo({ commentId, username })}
            onDelete={removeComment}
          />
        </div>
        {viewerId !== null ? (
          <CommentComposer
            pending={pending}
            error={error}
            viewerAvatarUrl={viewerAvatarUrl}
            viewerDisplayName={viewerDisplayName}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSubmit={postComment}
          />
        ) : (
          <div style={{ padding: "12px 0", fontSize: 12, color: "var(--muted)", fontStyle: "italic", borderTop: "1px solid var(--muted)" }}>
            Sign in to comment.
          </div>
        )}
      </>
    </ThreadSheet>
  );
}
