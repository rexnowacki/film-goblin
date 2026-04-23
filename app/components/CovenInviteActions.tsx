"use client";

import { useTransition } from "react";
import { acceptCovenRequest, declineCovenRequest } from "@/lib/actions/coven";

interface Props { requestId: string; }

export default function CovenInviteActions({ requestId }: Props) {
  const [pending, start] = useTransition();
  const act = (fn: (id: string) => Promise<void>) =>
    start(async () => { try { await fn(requestId); } catch (e) { console.error(e); } });

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={() => act(acceptCovenRequest)} disabled={pending}
        style={{ padding: "8px 14px", background: "var(--accent)", color: "var(--accent-ink)", border: "2px solid var(--accent)", cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Accept
      </button>
      <button onClick={() => act(declineCovenRequest)} disabled={pending}
        style={{ padding: "8px 14px", background: "transparent", color: "var(--bone)", border: "2px solid var(--muted)", cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Decline
      </button>
    </div>
  );
}
