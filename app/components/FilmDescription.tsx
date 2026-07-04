"use client";

import { useState } from "react";

const CLAMP_THRESHOLD = 320;

/**
 * Film synopsis with a read-more clamp. Distributor copy runs long (often a
 * full press paragraph); clamp to four lines so tags and actions stay above
 * the fold. Short descriptions render unclamped with no toggle.
 */
export default function FilmDescription({ text }: { text: string }) {
  const clampable = text.length > CLAMP_THRESHOLD;
  const [expanded, setExpanded] = useState(false);
  const clamped = clampable && !expanded;

  return (
    <div style={{ margin: "0 0 28px", maxWidth: 640 }}>
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 22,
          fontStyle: "italic",
          lineHeight: 1.4,
          margin: 0,
          ...(clamped
            ? {
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical" as const,
                overflow: "hidden",
              }
            : {}),
        }}
      >
        {text}
      </p>
      {clampable && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="caps"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            marginTop: 10,
            color: "var(--accent)",
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            cursor: "pointer",
          }}
        >
          {expanded ? "Fold it away" : "Read the rest →"}
        </button>
      )}
    </div>
  );
}
