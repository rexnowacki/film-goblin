"use client";

import { useState, useTransition } from "react";
import BottomSheet from "./BottomSheet";
import CommentList from "./CommentList";
import CommentComposer from "./CommentComposer";
import { addActivityComment, deleteActivityComment } from "@/lib/actions/activity-comments";
import type { CommentItem } from "@/lib/queries/activity-comments";

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

  function postComment(body: string) {
    if (!viewerId) return;
    setError(null);
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: CommentItem = {
      id: tempId,
      user_id: viewerId,
      user: { username: "...", display_name: null, avatar_url: viewerAvatarUrl },
      body,
      created_at: new Date().toISOString(),
      like_count: 0,
      liked_by_me: false,
      parent_id: null,
      reply_count: 0,
    };
    setItems(prev => {
      const next = [...prev, optimistic];
      onCountChange(next.length);
      return next;
    });
    startTransition(async () => {
      const result = await addActivityComment(activityId, body);
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
      const next = p.filter(c => c.id !== id);
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
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div style={{ display: "flex", flexDirection: "column", height: "70dvh" }}>
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
          <CommentList
            items={items}
            viewerId={viewerId}
            actorUserId={actorUserId}
            onDelete={removeComment}
          />
        </div>
        {viewerId !== null ? (
          <CommentComposer
            pending={pending}
            error={error}
            viewerAvatarUrl={viewerAvatarUrl}
            viewerDisplayName={viewerDisplayName}
            onSubmit={postComment}
          />
        ) : (
          <div style={{ padding: "12px 0", fontSize: 12, color: "var(--muted)", fontStyle: "italic", borderTop: "1px solid var(--muted)" }}>
            Sign in to comment.
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
