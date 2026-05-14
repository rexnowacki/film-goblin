"use client";

import { useEffect, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import RitualComposer, { type MentionCandidate } from "./RitualComposer";

interface Props {
  onSend: (body: string) => Promise<void>;
  lookupMentions: (prefix: string) => Promise<MentionCandidate[]>;
  // Fires whenever the sheet open-state flips. The page wrapper collapses
  // the film-card header while the sheet is open and restores it on close.
  onComposingChange?: (open: boolean) => void;
}

// Tappable bar that lives at the bottom of the chat scroll. Tapping opens
// a BottomSheet that hosts the actual composer — matches the modal-comment
// pattern used elsewhere on the site (CommentSheet, GoblinWhisperButton).
export default function RitualComposeBar({ onSend, lookupMentions, onComposingChange }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    onComposingChange?.(open);
  }, [open, onComposingChange]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", padding: "14px 16px",
          background: "var(--void-2, #141414)",
          border: "none", borderTop: "1px solid #2a2a2a",
          color: "var(--muted)", cursor: "pointer", textAlign: "left",
          fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14,
        }}
        aria-label="Open composer"
      >
        <SpeakIcon />
        <span style={{ flex: 1 }}>Speak into the circle…</span>
        <span style={{
          fontFamily: "var(--font-ui)", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.1em", color: "var(--accent)", textTransform: "uppercase",
        }}>
          Compose →
        </span>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Speak into the Circle">
        <div style={{ padding: "4px 4px 16px" }}>
          <RitualComposer
            onSend={onSend}
            lookupMentions={lookupMentions}
            onSent={() => setOpen(false)}
            autoFocus
          />
        </div>
      </BottomSheet>
    </>
  );
}

function SpeakIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
