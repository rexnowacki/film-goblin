"use client";

import { useState } from "react";
import Avatar from "./Avatar";

const MAX_LEN = 140;

interface Props {
  pending: boolean;
  error: string | null;
  viewerAvatarUrl: string | null;
  viewerDisplayName: string | null;
  replyTo: { commentId: string; username: string } | null;
  onCancelReply: () => void;
  onSubmit: (body: string) => void;
}

export default function CommentComposer({
  pending,
  error,
  viewerAvatarUrl,
  viewerDisplayName,
  replyTo,
  onCancelReply,
  onSubmit,
}: Props) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();
  const overLimit = trimmed.length > MAX_LEN;
  const canPost = trimmed.length > 0 && !overLimit && !pending;

  function submit() {
    if (!canPost) return;
    onSubmit(trimmed);
    setDraft("");
  }

  // .composer-row is display:flex — the banner must live outside it, in a
  // wrapping div that also carries the iOS keyboard padding.
  return (
    <div style={{ paddingBottom: "env(keyboard-inset-height, 0px)" }}>
      {replyTo && (
        <div className="composer-replying-to">
          <span>Replying to <strong>@{replyTo.username}</strong></span>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply">✕</button>
        </div>
      )}
      {error && (
        <div style={{
          fontSize: 11, color: "var(--blood)", marginBottom: 8,
          fontFamily: "var(--font-serif)", fontStyle: "italic",
        }}>
          {error}
        </div>
      )}
      <div className="composer-row">
        <Avatar
          name={viewerDisplayName ?? "you"}
          color="var(--accent)"
          size={32}
          url={viewerAvatarUrl}
        />
        <div className="composer-pill">
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && canPost) { e.preventDefault(); submit(); } }}
            placeholder={replyTo ? "Reply…" : "Add a comment…"}
            maxLength={MAX_LEN + 1}
          />
          <span className={`composer-counter ${overLimit ? "over" : ""}`}>
            {trimmed.length}/{MAX_LEN}
          </span>
        </div>
        {canPost ? (
          <button type="button" className="btn btn-sm" onClick={submit}>
            {pending ? "…" : "Post"}
          </button>
        ) : (
          <button
            type="button"
            className="composer-post-link"
            disabled
            aria-label="Post (disabled)"
          >
            Post
          </button>
        )}
      </div>
    </div>
  );
}
