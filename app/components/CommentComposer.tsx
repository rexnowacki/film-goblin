"use client";

import { useRef, useState } from "react";
import Avatar from "./Avatar";

const MAX_LEN = 140;

const QUICK_EMOJI = ["💀", "⚰️", "🖤", "🦇", "🌙", "🔪", "👁️", "🩸"] as const;

interface Props {
  pending: boolean;
  error: string | null;
  viewerAvatarUrl: string | null;
  viewerDisplayName: string | null;
  replyTo: { commentId: string; username: string } | null;
  onCancelReply: () => void;
  onSubmit: (body: string) => void;
}

function SendIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke={filled ? "currentColor" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 13V3" />
      <path d="M3 8l5-5 5 5" />
    </svg>
  );
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
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = draft.trim();
  const overLimit = trimmed.length > MAX_LEN;
  const canPost = trimmed.length > 0 && !overLimit && !pending;

  function submit() {
    if (!canPost) return;
    onSubmit(trimmed);
    setDraft("");
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    if (!el) {
      // Fall back to append if the input never mounted (shouldn't happen in practice).
      setDraft(d => d + emoji);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    // Restore caret after the inserted emoji on the next tick (state flush).
    requestAnimationFrame(() => {
      const pos = start + emoji.length;
      el.focus();
      try { el.setSelectionRange(pos, pos); } catch { /* ignore */ }
    });
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
          fontSize: 11, color: "var(--danger)", marginBottom: 8,
          fontFamily: "var(--font-serif)", fontStyle: "italic",
        }}>
          {error}
        </div>
      )}
      <div className="composer-emoji-strip" role="toolbar" aria-label="Quick reactions">
        {QUICK_EMOJI.map(e => (
          <button
            key={e}
            type="button"
            className="composer-emoji-btn"
            onMouseDown={ev => ev.preventDefault() /* keep focus in input */}
            onClick={() => insertEmoji(e)}
            aria-label={`Insert ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="composer-row">
        <Avatar
          name={viewerDisplayName ?? "you"}
          color="var(--accent)"
          size={32}
          url={viewerAvatarUrl}
        />
        <div className="composer-pill">
          <input
            ref={inputRef}
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
        <button
          type="button"
          className={canPost ? "composer-send-btn enabled" : "composer-send-btn"}
          onClick={submit}
          disabled={!canPost}
          aria-label={pending ? "Posting" : "Post comment"}
        >
          <SendIcon filled={canPost} />
        </button>
      </div>
    </div>
  );
}
