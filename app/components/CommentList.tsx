"use client";

import CommentNode from "./CommentNode";
import type { CommentItem } from "@/lib/queries/activity-comments";

interface Props {
  items: CommentItem[];
  childrenMap: Map<string, CommentItem[]>;
  viewerId: string | null;
  actorUserId: string;
  expandedIds: Set<string>;
  onExpand: (id: string) => void;
  onReply: (commentId: string, username: string) => void;
  onDelete: (id: string) => void;
}

export default function CommentList({
  items, childrenMap, viewerId, actorUserId,
  expandedIds, onExpand, onReply, onDelete,
}: Props) {
  const topLevel = items.filter(i => i.parent_id === null);
  if (topLevel.length === 0) {
    return (
      <div style={{
        padding: "24px 0",
        fontFamily: "var(--font-serif)",
        fontStyle: "italic",
        color: "var(--muted)",
        textAlign: "center",
      }}>
        No comments yet. Be the first.
      </div>
    );
  }
  return (
    <div>
      {topLevel.map(c => (
        <CommentNode
          key={c.id}
          comment={c}
          childrenMap={childrenMap}
          depth={0}
          viewerId={viewerId}
          actorUserId={actorUserId}
          expandedIds={expandedIds}
          onExpand={onExpand}
          onReply={onReply}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
