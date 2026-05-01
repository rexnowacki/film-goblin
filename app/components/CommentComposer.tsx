"use client";

import { useState } from "react";

const MAX_LEN = 140;

interface Props {
  pending: boolean;
  error: string | null;
  onSubmit: (body: string) => void;
}

export default function CommentComposer({ pending, error, onSubmit }: Props) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();
  const overLimit = trimmed.length > MAX_LEN;
  const canPost = trimmed.length > 0 && !overLimit && !pending;

  function submit() {
    if (!canPost) return;
    onSubmit(trimmed);
    setDraft("");
  }

  return (
    <div
      style={{
        borderTop: "1px solid var(--muted)",
        paddingTop: 12,
        marginTop: 12,
        paddingBottom: "env(keyboard-inset-height, 0px)",
        background: "var(--bone)",
      }}
    >
      {error && (
        <div style={{ fontSize: 11, color: "var(--blood)", marginBottom: 8, fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && canPost) { e.preventDefault(); submit(); } }}
          placeholder="Add a comment…"
          maxLength={MAX_LEN + 1}
          style={{
            flex: 1,
            fontSize: 14,
            padding: "10px 12px",
            background: "var(--void-2)",
            color: "var(--bone)",
            border: "1px solid var(--muted)",
          }}
        />
        <span style={{ fontSize: 10, color: overLimit ? "var(--accent)" : "var(--muted)", minWidth: 38, textAlign: "right" }}>
          {trimmed.length}/{MAX_LEN}
        </span>
        <button type="button" className="btn btn-sm" onClick={submit} disabled={!canPost}>
          {pending ? "…" : "Post"}
        </button>
      </div>
    </div>
  );
}
