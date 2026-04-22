"use client";

import { useState, useTransition } from "react";
import { subscribeToList, unsubscribeFromList } from "@/lib/actions/lists";

interface Props {
  listId: string;
  initialSubscribed: boolean;
  disabled?: boolean;
}

export default function SubscribeButton({ listId, initialSubscribed, disabled }: Props) {
  const [subbed, setSubbed] = useState(initialSubscribed);
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      try {
        if (subbed) {
          await unsubscribeFromList(listId);
          setSubbed(false);
        } else {
          await subscribeToList(listId);
          setSubbed(true);
        }
      } catch (e) { console.error(e); }
    });
  }

  return (
    <button onClick={toggle} disabled={disabled || pending} className="caps" style={{
      background: subbed ? "var(--accent)" : "transparent",
      color: subbed ? "var(--accent-ink)" : "var(--bone)",
      border: "2px solid var(--accent)",
      padding: "6px 12px", fontSize: 10, cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700,
    }}>
      {subbed ? "✓ Subscribed" : "+ Subscribe"}
    </button>
  );
}
