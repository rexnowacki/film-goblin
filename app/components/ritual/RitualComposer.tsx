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
}

const MAX = 1000;

export default function RitualComposer({ onSend, lookupMentions }: Props) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @-mention typeahead state
  const [mentionState, setMentionState] = useState<{
    active: boolean;
    prefix: string;
    candidates: MentionCandidate[];
    selectedIdx: number;
    startPos: number; // index of '@' in body
  }>({ active: false, prefix: "", candidates: [], selectedIdx: 0, startPos: -1 });

  // Compute current @-prefix from caret position.
  function detectMention(value: string, caret: number) {
    // Walk back from caret to find '@' bounded by start-of-string or whitespace.
    let i = caret - 1;
    while (i >= 0 && /[a-z0-9._]/i.test(value[i])) i--;
    if (i < 0 || value[i] !== "@") return null;
    if (i > 0 && /[a-z0-9._]/i.test(value[i - 1])) return null; // mid-word @ (e.g. email)
    const prefix = value.slice(i + 1, caret).toLowerCase();
    if (prefix.length === 0) return { startPos: i, prefix: "" };
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

  // Debounced lookup whenever active prefix changes
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
    <div style={{ borderTop: "1px solid #2a2a2a", padding: "10px 12px", position: "relative", background: "var(--void)" }}>
      {mentionState.active && mentionState.candidates.length > 0 && (
        <div
          style={{
            position: "absolute", bottom: "100%", left: 12, right: 12, marginBottom: 4,
            background: "var(--void-2, #141414)", border: "1px solid #2a2a2a",
            maxHeight: 220, overflowY: "auto",
            boxShadow: "0 -4px 16px rgba(0,0,0,0.45)",
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
          marginBottom: 6, padding: "4px 8px",
          fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12,
          color: "var(--blood, #d93a2e)",
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <textarea
          ref={textareaRef}
          rows={1}
          value={body}
          placeholder="Speak into the circle… use @ to summon another."
          onChange={onChange}
          onKeyDown={onKeyDown}
          style={{
            flex: 1, resize: "none",
            background: "var(--void-2, #141414)",
            border: "1px solid #333", color: "var(--bone)",
            padding: "10px 12px", outline: "none",
            fontFamily: "var(--font-serif)", fontSize: 14, lineHeight: 1.5,
            maxHeight: 160, overflowY: "auto",
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || body.trim().length === 0 || tooLong}
          className="btn btn-sm"
          style={{ flexShrink: 0 }}
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
      {body.length > 800 && (
        <div style={{
          marginTop: 4, textAlign: "right",
          fontFamily: "var(--font-ui)", fontSize: 10, letterSpacing: "0.06em",
          color: tooLong ? "var(--blood, #d93a2e)" : "var(--muted)",
        }}>
          {remaining}
        </div>
      )}
    </div>
  );
}
