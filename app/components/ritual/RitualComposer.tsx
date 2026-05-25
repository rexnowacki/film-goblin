"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "../ui/Avatar";
import { useCachedTypeahead } from "@/lib/hooks/useCachedTypeahead";

export interface MentionCandidate {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
}

interface Props {
  onSend: (body: string) => Promise<void>;
  lookupMentions: (prefix: string) => Promise<MentionCandidate[]>;
  viewerAvatarUrl: string | null;
  viewerDisplayName: string | null;
}

const MAX = 1000;

const QUICK_EMOJI = ["💀", "⚰️", "🖤", "🦇", "🌙", "🔪", "👁️", "🩸"] as const;

// Mirrors CommentComposer's structure: emoji strip + composer-row (avatar
// + pill input + send button). The outer wrapper applies
// `padding-bottom: env(keyboard-inset-height)` so iOS Safari 17+ reserves
// vertical space for the soft keyboard and the pill always lands directly
// above it. Mention typeahead is preserved from the prior modal composer.
export default function RitualComposer({
  onSend,
  lookupMentions,
  viewerAvatarUrl,
  viewerDisplayName,
}: Props) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const mentionQuery = mentionState.active ? mentionState.prefix : "";
  const emptyMentionResults = useMemo<MentionCandidate[]>(() => [], []);
  const cachedMentionCandidates = useCachedTypeahead(mentionQuery, {
    minLength: 1,
    slowDelayMs: 120,
    fastDelayMs: 80,
    search: lookupMentions,
    filter: filterMentionCandidates,
    empty: emptyMentionResults,
  });

  useEffect(() => {
    setMentionState(s => s.active ? { ...s, candidates: cachedMentionCandidates, selectedIdx: 0 } : s);
  }, [cachedMentionCandidates]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [body]);

  function applyMention(c: MentionCandidate) {
    const before = body.slice(0, mentionState.startPos);
    const caret = inputRef.current?.selectionStart ?? body.length;
    const after = body.slice(caret);
    const insertion = `@${c.username}${after.length > 0 && /^[\s.,!?;:)]/.test(after) ? "" : " "}`;
    const next = before + insertion + after;
    setBody(next);
    setMentionState({ active: false, prefix: "", candidates: [], selectedIdx: 0, startPos: -1 });
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const pos = before.length + insertion.length;
      el.focus();
      try { el.setSelectionRange(pos, pos); } catch { /* ignore */ }
    });
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    if (!el) {
      setBody(d => d + emoji);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + emoji + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      const pos = start + emoji.length;
      el.focus();
      try { el.setSelectionRange(pos, pos); } catch { /* ignore */ }
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
    if (e.key === "Enter" && !e.shiftKey && canSend) {
      e.preventDefault();
      void send();
    }
  }

  const trimmed = body.trim();
  const overLimit = trimmed.length > MAX;
  const canSend = trimmed.length > 0 && !overLimit && !sending;

  return (
    <div style={{ paddingBottom: "env(keyboard-inset-height, 0px)" }}>
      {error && (
        <div style={{
          padding: "6px 12px", fontFamily: "var(--font-serif)", fontStyle: "italic",
          fontSize: 12, color: "var(--danger, #d93a2e)",
        }}>
          {error}
        </div>
      )}

      <div className="composer-emoji-strip" role="toolbar" aria-label="Quick reactions">
        {QUICK_EMOJI.map(e => (
          <button
            key={e}
            type="button"
            className="composer-emoji-btn"
            onMouseDown={ev => ev.preventDefault()}
            onClick={() => insertEmoji(e)}
            aria-label={`Insert ${e}`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="composer-row" style={{ position: "relative" }}>
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
                <span className="ritual-mention-item__handle">@{highlightMatch(c.username, mentionState.prefix)}</span>
                {c.display_name && <span className="ritual-mention-item__name">{highlightMatch(c.display_name, mentionState.prefix)}</span>}
              </button>
            ))}
          </div>
        )}

        <Avatar
          name={viewerDisplayName ?? "you"}
          color="var(--accent)"
          size={32}
          url={viewerAvatarUrl}
        />
        <div className="composer-pill ritual-composer-pill">
          <textarea
            ref={inputRef}
            value={body}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder="Speak into the circle…"
            maxLength={MAX + 1}
            rows={2}
          />
          <span className={`composer-counter ${overLimit ? "over" : ""}`}>
            {trimmed.length}/{MAX}
          </span>
        </div>
        <button
          type="button"
          className={canSend ? "composer-send-btn enabled" : "composer-send-btn"}
          onMouseDown={(e) => { e.preventDefault(); void send(); }}
          disabled={!canSend}
          aria-label={sending ? "Sending" : "Send message"}
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 13V3" />
      <path d="M3 8l5-5 5 5" />
    </svg>
  );
}

function filterMentionCandidates(candidates: MentionCandidate[], prefix: string): MentionCandidate[] {
  return candidates.filter(c =>
    c.username.toLowerCase().includes(prefix) ||
    (c.display_name?.toLowerCase().includes(prefix) ?? false)
  );
}

function highlightMatch(text: string, rawQuery: string): React.ReactNode {
  const query = rawQuery.trim();
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="ritual-mention-item__match">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
