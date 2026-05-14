"use client";

import { useEffect, useRef, useState } from "react";

export interface MentionCandidate {
  id: string;
  username: string;
  display_name: string | null;
}

interface Props {
  onSend: (body: string) => Promise<void>;
  lookupMentions: (prefix: string) => Promise<MentionCandidate[]>;
  // Fired on focus/blur so the page wrapper can collapse the film-card
  // header while the user is composing.
  onComposingChange?: (composing: boolean) => void;
}

const MAX = 1000;
const ROW_HEIGHT = 22;
const MIN_ROWS = 1;
const MAX_ROWS = 4;

// Inline composer — single tap on the textarea = ready to type. No modal,
// no separate "open composer" button. Sized to fit at the bottom of a
// 100dvh flex layout next to the send button.
export default function RitualComposer({ onSend, lookupMentions, onComposingChange }: Props) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize: nudge the textarea to fit content, capped at MAX_ROWS lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = ROW_HEIGHT * MAX_ROWS + 20;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [body]);

  const [mentionState, setMentionState] = useState<{
    active: boolean;
    prefix: string;
    candidates: MentionCandidate[];
    selectedIdx: number;
    startPos: number;
  }>({ active: false, prefix: "", candidates: [], selectedIdx: 0, startPos: -1 });

  function detectMention(value: string, caret: number) {
    let i = caret - 1;
    while (i >= 0 && /[a-z0-9._]/i.test(value[i])) i--;
    if (i < 0 || value[i] !== "@") return null;
    if (i > 0 && /[a-z0-9._]/i.test(value[i - 1])) return null;
    const prefix = value.slice(i + 1, caret).toLowerCase();
    return { startPos: i, prefix };
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setBody(v);
    const caret = e.target.selectionStart ?? v.length;
    const m = detectMention(v, caret);
    if (m) {
      setMentionState(s => ({ ...s, active: true, prefix: m.prefix, startPos: m.startPos, selectedIdx: 0 }));
    } else {
      setMentionState({ active: false, prefix: "", candidates: [], selectedIdx: 0, startPos: -1 });
    }
  }

  useEffect(() => {
    if (!mentionState.active) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const results = await lookupMentions(mentionState.prefix);
      if (cancelled) return;
      setMentionState(s => s.active ? { ...s, candidates: results, selectedIdx: 0 } : s);
    }, 100);
    return () => { cancelled = true; clearTimeout(t); };
  }, [mentionState.active, mentionState.prefix, lookupMentions]);

  function applyMention(c: MentionCandidate) {
    const before = body.slice(0, mentionState.startPos);
    const caret = textareaRef.current?.selectionStart ?? body.length;
    const after = body.slice(caret);
    const insertion = `@${c.username} `;
    const next = before + insertion + after;
    setBody(next);
    setMentionState({ active: false, prefix: "", candidates: [], selectedIdx: 0, startPos: -1 });
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = before.length + insertion.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  async function send() {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(trimmed);
      setBody("");
      // Blur so the keyboard dismisses and the header restores via onBlur.
      // The user can tap back in to compose another message.
      textareaRef.current?.blur();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionState.active && mentionState.candidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionState(s => ({ ...s, selectedIdx: (s.selectedIdx + 1) % s.candidates.length }));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionState(s => ({ ...s, selectedIdx: (s.selectedIdx - 1 + s.candidates.length) % s.candidates.length }));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyMention(mentionState.candidates[mentionState.selectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionState({ active: false, prefix: "", candidates: [], selectedIdx: 0, startPos: -1 });
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const remaining = MAX - body.length;
  const tooLong = remaining < 0;

  return (
    <div style={{ borderTop: "1px solid #2a2a2a", background: "var(--void)", position: "relative" }}>
      {mentionState.active && mentionState.candidates.length > 0 && (
        <div
          style={{
            position: "absolute", bottom: "100%", left: 8, right: 8, marginBottom: 4,
            background: "var(--void-2, #141414)", border: "1px solid #2a2a2a",
            maxHeight: 220, overflowY: "auto",
            boxShadow: "0 -4px 16px rgba(0,0,0,0.45)",
            zIndex: 2,
          }}
        >
          {mentionState.candidates.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); applyMention(c); }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "8px 12px", border: "none",
                background: i === mentionState.selectedIdx ? "rgba(255,45,136,0.12)" : "transparent",
                color: "var(--bone)", textAlign: "left", cursor: "pointer",
                fontFamily: "var(--font-ui)", fontSize: 13,
              }}
            >
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>@{c.username}</span>
              {c.display_name && (
                <span style={{ color: "var(--muted)", fontSize: 12, fontStyle: "italic" }}>
                  {c.display_name}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{
          padding: "6px 12px",
          fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12,
          color: "var(--blood, #d93a2e)",
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "8px 10px" }}>
        <textarea
          ref={textareaRef}
          rows={MIN_ROWS}
          value={body}
          placeholder="Speak into the circle…"
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={() => onComposingChange?.(true)}
          onBlur={() => onComposingChange?.(false)}
          style={{
            flex: 1, resize: "none",
            background: "var(--void-2, #141414)",
            border: "1px solid #333", color: "var(--bone)",
            padding: "10px 12px", outline: "none",
            fontFamily: "var(--font-serif)", fontSize: 15, lineHeight: `${ROW_HEIGHT}px`,
            minHeight: 42, overflowY: "auto",
          }}
        />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); void send(); }}
          disabled={sending || body.trim().length === 0 || tooLong}
          aria-label="Send message"
          style={{
            flexShrink: 0,
            width: 42, height: 42,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: body.trim().length === 0 || tooLong ? "var(--void-2, #141414)" : "var(--accent)",
            color: body.trim().length === 0 || tooLong ? "var(--muted)" : "var(--void)",
            border: "1px solid #333", cursor: "pointer",
          }}
        >
          {sending ? <span style={{ fontFamily: "var(--font-ui)", fontSize: 11 }}>…</span> : <SendIcon />}
        </button>
      </div>
      {body.length > 800 && (
        <div style={{
          padding: "0 12px 6px", textAlign: "right",
          fontFamily: "var(--font-ui)", fontSize: 10, letterSpacing: "0.06em",
          color: tooLong ? "var(--blood, #d93a2e)" : "var(--muted)",
        }}>
          {remaining}
        </div>
      )}
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
