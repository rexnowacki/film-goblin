"use client";

import { useState } from "react";
import RitualChat from "./RitualChat";
import type { RitualMessage } from "@/lib/queries/ritual";

interface Props {
  pickId: number;
  archived: boolean;
  initialMessages: RitualMessage[];
  currentUserId: string | null;
  // RitualHeader rendered server-side and passed through as a slot so this
  // wrapper can collapse it when the composer is open without needing to
  // re-implement header rendering on the client.
  header: React.ReactNode;
}

// Wraps header + chat in a flex column, hides the header while the composer
// sheet is open ("elongating" the chat), and restores it on close (submit
// OR dismiss). Smooth max-height animation keeps the transition tactile.
export default function RitualPageBody({ pickId, archived, initialMessages, currentUserId, header }: Props) {
  const [composing, setComposing] = useState(false);

  return (
    <div
      className="container-wide"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        padding: "12px var(--container-pad) 12px",
        gap: 12,
      }}
    >
      <div
        style={{
          maxHeight: composing ? 0 : 600,
          opacity: composing ? 0 : 1,
          overflow: "hidden",
          transition: "max-height 0.28s ease, opacity 0.18s ease",
        }}
        aria-hidden={composing}
      >
        {header}
      </div>

      <RitualChat
        pickId={pickId}
        archived={archived}
        initialMessages={initialMessages}
        currentUserId={currentUserId}
        onComposingChange={setComposing}
      />
    </div>
  );
}
