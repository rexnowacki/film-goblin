"use client";

import { useState } from "react";

export default function CopyInviteButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the text
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch", marginTop: 10, flexWrap: "wrap" }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: "9px 12px",
          background: "var(--void-2)",
          border: "1px solid #444",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--muted)",
          wordBreak: "break-all",
          lineHeight: 1.4,
        }}
      >
        {url}
      </div>
      <button
        type="button"
        onClick={copy}
        style={{
          flexShrink: 0,
          padding: "9px 16px",
          background: copied ? "var(--accent)" : "transparent",
          color: copied ? "var(--void)" : "var(--bone)",
          border: `2px solid ${copied ? "var(--accent)" : "var(--bone)"}`,
          fontFamily: "var(--font-ui)",
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: "pointer",
          transition: "background 0.15s, color 0.15s, border-color 0.15s",
        }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
