"use client";

import Link from "next/link";
import Avatar from "./Avatar";
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map(c => {
        const canDelete = viewerId !== null && (viewerId === c.user_id || viewerId === actorUserId);
        return (
          <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
            <Avatar
              name={c.user.display_name ?? c.user.username}
              color="var(--accent)"
              size={26}
              url={c.user.avatar_url}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div>
                <Link href={`/p/${encodeURIComponent(c.user.username)}`} style={{ color: "var(--void)", fontWeight: 700 }}>
                  @{c.user.username}
                </Link>{" "}
                <span style={{ wordBreak: "break-word" }}>{c.body}</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{relativeTime(c.created_at)}</div>
            </div>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(c.id)}
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
  );
}
