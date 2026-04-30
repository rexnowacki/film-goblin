"use client";

import { useState, useTransition } from "react";
import { sendCovenRequest, declineCovenRequest, acceptCovenRequest } from "@/lib/actions/coven";
import type { CovenState } from "@/lib/queries/coven";

interface Props {
  targetUserId: string;
  targetUsername: string;
  initialState: CovenState;
  initialRequestId: string | null;
}

export default function CovenButton({ targetUserId, targetUsername, initialState, initialRequestId }: Props) {
  const [state, setState] = useState<CovenState>(initialState);
  const [requestId, setRequestId] = useState<string | null>(initialRequestId);
  const [pending, start] = useTransition();

  function dispatch(kind: "invite" | "cancel" | "accept" | "decline") {
    start(async () => {
      try {
        if (kind === "invite") {
          const { id } = await sendCovenRequest(targetUserId, targetUsername);
          setRequestId(id);
          setState("pending_outbound");
        } else if (kind === "cancel" && requestId) {
          await declineCovenRequest(requestId);
          setRequestId(null);
          setState("none");
        } else if (kind === "accept" && requestId) {
          await acceptCovenRequest(requestId);
          setRequestId(null);
          setState("member");
        } else if (kind === "decline" && requestId) {
          await declineCovenRequest(requestId);
          setRequestId(null);
          setState("none");
        }
      } catch (e) { console.error(e); }
    });
  }

  const base = { padding: "10px 18px", cursor: "pointer" as const, fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" as const };

  if (state === "none") {
    return <button onClick={() => dispatch("invite")} disabled={pending} className="btn" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: "2px solid var(--accent)" }}>✦ Invite to Coven</button>;
  }
  if (state === "pending_outbound") {
    return <button onClick={() => dispatch("cancel")} disabled={pending} className="btn btn-outline" style={{ color: "var(--bone)", borderColor: "var(--muted)" }}>Cancel invite</button>;
  }
  if (state === "pending_inbound") {
    return (
      <span style={{ display: "inline-flex", gap: 6 }}>
        <button onClick={() => dispatch("accept")} disabled={pending} style={{ ...base, background: "var(--accent)", color: "var(--accent-ink)", border: "2px solid var(--accent)" }}>Accept</button>
        <button onClick={() => dispatch("decline")} disabled={pending} style={{ ...base, background: "transparent", color: "var(--bone)", border: "2px solid var(--muted)" }}>Decline</button>
      </span>
    );
  }
  return <span className="caps" style={{ fontSize: 11, color: "var(--accent)" }}>✦ In your coven</span>;
}
