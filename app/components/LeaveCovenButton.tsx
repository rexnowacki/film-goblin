"use client";

import { useState, useTransition } from "react";
import { leaveCoven } from "@/lib/actions/coven";

interface Props { otherUserId: string; otherUsername: string; otherDisplayName: string; }

export default function LeaveCovenButton({ otherUserId, otherUsername, otherDisplayName }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  function onLeave() {
    start(async () => {
      try { await leaveCoven(otherUserId, otherUsername); }
      catch (e) { console.error(e); }
    });
  }

  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)} className="caps"
        style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--muted)", padding: "6px 10px", fontSize: 10, cursor: "pointer" }}>
        Leave
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button onClick={onLeave} disabled={pending}
        style={{ padding: "6px 10px", background: "var(--danger)", color: "var(--danger-ink)", border: 0, cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Leave {otherDisplayName}?
      </button>
      <button onClick={() => setConfirm(false)}
        style={{ padding: "6px 10px", background: "transparent", color: "var(--muted)", border: "1px solid var(--muted)", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 10 }}>
        Cancel
      </button>
    </span>
  );
}
