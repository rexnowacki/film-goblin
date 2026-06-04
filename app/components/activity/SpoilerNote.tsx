"use client";

import { useState } from "react";

interface Props {
  note: string;
  hidden: boolean;
}

export default function SpoilerNote({ note, hidden }: Props) {
  const [revealed, setRevealed] = useState(!hidden);

  if (!revealed) {
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        style={{
          display: "block",
          width: "100%",
          marginTop: 6,
          padding: "9px 10px",
          border: "1px dashed var(--accent)",
          background: "rgba(255,45,136,0.08)",
          color: "var(--accent)",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textAlign: "left",
          textTransform: "uppercase",
        }}
      >
        Spoiler hidden - tap to reveal
      </button>
    );
  }

  return (
    <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginTop: 4, color: "var(--muted)" }}>
      &ldquo;{note}&rdquo;
    </div>
  );
}
