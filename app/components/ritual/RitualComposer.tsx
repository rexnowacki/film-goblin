"use client";

import { useEffect, useRef, useState } from "react";

export interface MentionCandidate {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
}

interface Props {
  onSend: (body: string) => Promise<void>;
  lookupMentions: (prefix: string) => Promise<MentionCandidate[]>;
  // Fired when the textarea is focused/blurred so the page wrapper can
  // collapse the film-card header during composing.
  onComposingChange?: (composing: boolean) => void;
}

const MAX = 1000;
const ROW_HEIGHT = 22;

// Modal-style composer that single-taps. The textarea is rendered once and
// only its parent's classes change between rest and expanded states; iOS
// keeps focus and the keyboard stays up after the first tap because the
// element identity never changes.
export default function RitualComposer({ onSend, lookupMentions, onComposingChange }: Props) {
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow within the per-state max.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = expanded ? ROW_HEIGHT * 9 + 40 : ROW_HEIGHT * 2 + 20;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [body, expanded]);

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
    const prefix = value.slice(i + 1, caret);
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

  // Lookup whenever the active prefix changes. Empty prefix = clear list
  // (we don't pre-load a "top users" list — same behaviour as feed-search).
  useEffect(() => {
    if (!mentionState.active) return;
    if (mentionState.prefix.length < 1) {
      setMentionState(s => s.active ? { ...s, candidates: [], selectedIdx: 0 } : s);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const results = await lookupMentions(mentionState.prefix);
      if (cancelled) return;
      setMentionState(s => s.active ? { ...s, candidates: results, selectedIdx: 0 } : s);
    }, 120);
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
      // Blur dismisses the keyboard, which fires onBlur → collapse + restore header.
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
    if (e.key === "Escape" && expanded) {
      e.preventDefault();
      textareaRef.current?.blur();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function onFocus() {
    setExpanded(true);
    onComposingChange?.(true);
  }

  function onBlur() {
    // Defer so a click on a mention candidate (which fires before blur) can run first.
    setTimeout(() => {
      setExpanded(false);
      setMentionState({ active: false, prefix: "", candidates: [], selectedIdx: 0, startPos: -1 });
      onComposingChange?.(false);
    }, 80);
  }

  function onBackdropClick() {
    textareaRef.current?.blur();
  }

  const remaining = MAX - body.length;
  const tooLong = remaining < 0;
  const ready = body.trim().length > 0 && !tooLong;

  return (
    <>
      {expanded && (
        <div
          className="ritual-composer-backdrop"
          onMouseDown={onBackdropClick}
          aria-hidden="true"
        />
      )}

      <div className={`ritual-composer${expanded ? " is-expanded" : ""}`}>
        {error && <div className="ritual-composer__error">{error}</div>}

        <div className="ritual-composer__panel">
          <div style={{ flex: 1, position: "relative" }}>
            {mentionState.active && mentionState.candidates.length > 0 && (
              <div className="ritual-mention-dropdown" role="listbox">
                {mentionState.candidates.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={i === mentionState.selectedIdx}
                    className={`ritual-mention-item${i === mentionState.selectedIdx ? " is-selected" : ""}`}
                    onMouseDown={(e) => { e.preventDefault(); applyMention(c); }}
                  >
                    {c.avatar_url ? (
                      <img className="ritual-mention-item__avatar" src={c.avatar_url} alt="" />
                    ) : (
                      <div className="ritual-mention-item__avatar" aria-hidden="true" />
                    )}
                    <span className="ritual-mention-item__handle">@{c.username}</span>
                    {c.display_name && <span className="ritual-mention-item__name">{c.display_name}</span>}
                  </button>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              className="ritual-composer__textarea"
              rows={1}
              value={body}
              placeholder={expanded ? "Speak into the circle… use @ to summon another." : "Speak into the circle…"}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onFocus={onFocus}
              onBlur={onBlur}
            />

            <div className="ritual-composer__panel-meta">
              <span>Enter to send · Shift + Enter for newline · Esc to dismiss</span>
              <span style={{ marginLeft: "auto" }} className={tooLong ? "is-overflow" : ""}>
                {body.length}/{MAX}
              </span>
            </div>
          </div>

          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); void send(); }}
            disabled={sending || !ready}
            aria-label="Send message"
            className={`ritual-composer__send${ready ? " is-ready" : ""}`}
          >
            {sending ? <span style={{ fontFamily: "var(--font-ui)", fontSize: 11 }}>…</span> : <SendIcon />}
          </button>
        </div>
      </div>
    </>
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
