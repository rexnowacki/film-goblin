"use client";

import Link from "next/link";
import Avatar from "./Avatar";
import CommentHeartButton from "./CommentHeartButton";
import { relativeTime } from "./activity/relativeTime";
import type { CommentItem } from "@/lib/queries/activity-comments";

interface Props {
  comment: CommentItem;
  childrenMap: Map<string, CommentItem[]>;
  depth: number;
  viewerId: string | null;
  actorUserId: string;
  expandedIds: Set<string>;
  onExpand: (id: string) => void;
  onReply: (commentId: string, username: string) => void;
  onDelete: (id: string) => void;
}

export default function CommentNode({
  comment, childrenMap, depth, viewerId, actorUserId,
  expandedIds, onExpand, onReply, onDelete,
}: Props) {
  const canDelete = viewerId !== null && (viewerId === comment.user_id || viewerId === actorUserId);
  const children = childrenMap.get(comment.id) ?? [];
  const replyCount = children.length;
  const isExpanded = expandedIds.has(comment.id);
  const avatarSize = depth === 0 ? 36 : 24;

  return (
    <div>
      <div className="comment-row">
        <Avatar
          name={comment.user.display_name ?? comment.user.username}
          color="var(--accent)"
          size={avatarSize}
          url={comment.user.avatar_url}
        />
        <div className="comment-row-body">
          <div className="comment-row-meta">
            <Link
              href={`/p/${encodeURIComponent(comment.user.username)}`}
              className="comment-row-username"
            >
              {comment.user.username}
            </Link>
            <span className="comment-row-time">{relativeTime(comment.created_at)}</span>
          </div>
          <div className="comment-row-text">{comment.body}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 4, alignItems: "center" }}>
            {viewerId !== null && (
              <button
                type="button"
                style={{
                  background: "none", border: "none", padding: 0,
                  fontFamily: "var(--font-ui)", fontSize: 11,
                  color: "var(--muted)", cursor: "pointer",
                }}
                onClick={() => onReply(comment.id, comment.user.username)}
              >
                Reply
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(comment.id)}
                className="comment-row-delete"
                aria-label="Delete comment"
              >
                Delete
              </button>
            )}
          </div>
        </div>
        <CommentHeartButton
          commentId={comment.id}
          initialCount={comment.like_count}
          initialLikedByMe={comment.liked_by_me}
          disabled={viewerId === null}
        />
      </div>

      {replyCount > 0 && (
        <div style={{ marginLeft: depth === 0 ? 46 : 34 }}>
          <button
            type="button"
            className="comment-view-replies"
            onClick={() => onExpand(comment.id)}
          >
            {isExpanded
              ? "Hide replies"
              : `View ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
          </button>
        </div>
      )}

      {isExpanded && replyCount > 0 && (
        <div className="comment-thread-rail">
          {children.map(child => (
            <CommentNode
              key={child.id}
              comment={child}
              childrenMap={childrenMap}
              depth={depth + 1}
              viewerId={viewerId}
              actorUserId={actorUserId}
              expandedIds={expandedIds}
              onExpand={onExpand}
              onReply={onReply}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
