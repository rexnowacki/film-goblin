"use client";

import Link from "next/link";
import Avatar from "./Avatar";
import CommentHeartButton from "./CommentHeartButton";
import { relativeTime } from "./activity/relativeTime";
import type { CommentItem } from "@/lib/queries/activity-comments";

interface Props {
  items: CommentItem[];
  viewerId: string | null;
  actorUserId: string;
  onDelete: (id: string) => void;
}

export default function CommentList({ items, viewerId, actorUserId, onDelete }: Props) {
  if (items.length === 0) {
    return (
      <div style={{ padding: "24px 0", fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", textAlign: "center" }}>
        No comments yet. Be the first.
      </div>
    );
  }
  return (
    <div>
      {items.map(c => {
        const canDelete = viewerId !== null && (viewerId === c.user_id || viewerId === actorUserId);
        return (
          <div key={c.id} className="comment-row">
            <Avatar
              name={c.user.display_name ?? c.user.username}
              color="var(--accent)"
              size={36}
              url={c.user.avatar_url}
            />
            <div className="comment-row-body">
              <div className="comment-row-meta">
                <Link href={`/p/${encodeURIComponent(c.user.username)}`} className="comment-row-username">
                  {c.user.username}
                </Link>
                <span className="comment-row-time">{relativeTime(c.created_at)}</span>
              </div>
              <div className="comment-row-text">{c.body}</div>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  className="comment-row-delete"
                  aria-label="Delete comment"
                >
                  Delete
                </button>
              )}
            </div>
            <CommentHeartButton
              commentId={c.id}
              initialCount={c.like_count}
              initialLikedByMe={c.liked_by_me}
              disabled={viewerId === null}
            />
          </div>
        );
      })}
    </div>
  );
}
