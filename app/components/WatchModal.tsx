"use client";

import { useState, useTransition } from "react";
import BottomSheet from "./BottomSheet";
import type { WatchlistDisposition } from "@/lib/actions/watched";

interface SaveValues {
  watched_at: string;
  note: string;
  recommended: boolean | null;
  spoiler: boolean;
  watchlistDisposition?: WatchlistDisposition;
}

interface Props {
  open: boolean;
  mode: "new" | "edit";
  initial: { watched_at: string; note: string; recommended: boolean | null; spoiler?: boolean; id?: string };
  filmTitle: string;
  onWatchlist?: boolean;
  currentlyShowing?: boolean;
  onSave(values: SaveValues): Promise<void>;
  onDelete?(): Promise<void>;
  onClose(): void;
}

const MAX_NOTE = 500;

export default function WatchModal({ open, mode, initial, filmTitle, onWatchlist = false, currentlyShowing = false, onSave, onDelete, onClose }: Props) {
  const [watchedAt, setWatchedAt] = useState(initial.watched_at);
  const [note, setNote] = useState(initial.note);
  const [recommended, setRecommended] = useState<boolean | null>(initial.recommended);
  const [spoiler, setSpoiler] = useState(Boolean(initial.spoiler));
  const [watchlistDisposition, setWatchlistDisposition] = useState<WatchlistDisposition>(currentlyShowing ? "keep" : "remove");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      setError(null);
      try {
        await onSave({
          watched_at: watchedAt,
          note,
          recommended,
          spoiler,
          watchlistDisposition: onWatchlist ? watchlistDisposition : undefined,
        });
        onClose();
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    });
  }

  function del() {
    if (!onDelete) return;
    if (!confirm("Delete this watch entry?")) return;
    start(async () => {
      setError(null);
      try {
        await onDelete();
        onClose();
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={mode === "new" ? "Log a watch" : "Edit watch"}>
      <div style={{ display: "grid", gap: 14, paddingBottom: "env(keyboard-inset-height, 0px)" }}>
        <div className="caps" style={{ fontSize: 11, opacity: 0.8 }}>
          {filmTitle}
        </div>
        <label>
          <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Watched on</div>
          <input
            type="date"
            value={watchedAt}
            onChange={e => setWatchedAt(e.target.value)}
            required
            style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14 }}
          />
        </label>
        <label>
          <div className="caps" style={{ fontSize: 11, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
            <span>Note (optional)</span>
            {note.length >= 400 && (
              <span style={{ color: note.length >= 500 ? "var(--danger)" : "var(--muted)" }}>
                {note.length} / {MAX_NOTE}
              </span>
            )}
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            maxLength={MAX_NOTE}
            placeholder="What did you think?"
            style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, resize: "none" }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={spoiler}
            onChange={e => setSpoiler(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: "var(--accent)" }}
          />
          <span className="caps" style={{ fontSize: 11, color: "var(--bone)" }}>Spoiler note</span>
        </label>
        <div>
          <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Verdict (optional)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { value: true, label: "Consecrated" },
              { value: false, label: "Cursed" },
            ].map(opt => {
              const active = recommended === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setRecommended(active ? null : opt.value)}
                  style={{
                    flex: 1, minWidth: 120,
                    padding: "10px 14px",
                    background: active ? (opt.value ? "var(--highlight)" : "var(--danger)") : "transparent",
                    color: active ? (opt.value ? "var(--void)" : "var(--bone)") : "var(--bone)",
                    border: `2px solid ${active ? (opt.value ? "var(--highlight)" : "var(--danger)") : "var(--muted)"}`,
                    fontFamily: "var(--font-ui)",
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
            Tap again to clear. Feeds the coven score.
          </div>
        </div>
        {onWatchlist && (
          <div>
            <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Watchlist</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { value: "keep" as const, label: "Keep" },
                { value: "remove" as const, label: "Remove" },
                { value: "library" as const, label: "Move to grimoire" },
              ].map(opt => {
                const active = watchlistDisposition === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWatchlistDisposition(opt.value)}
                    style={{
                      flex: 1,
                      minWidth: opt.value === "library" ? 150 : 96,
                      padding: "8px 12px",
                      border: `2px solid ${active ? "var(--accent)" : "var(--muted)"}`,
                      borderRadius: 999,
                      background: active ? "var(--accent)" : "transparent",
                      color: active ? "var(--accent-ink)" : "var(--bone)",
                      cursor: "pointer",
                      fontFamily: "var(--font-ui)",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {error && <div style={{ color: "var(--danger)", fontStyle: "italic", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <button
            type="button"
            onClick={save}
            disabled={pending || !watchedAt}
            className="btn btn-lg"
            style={{ flex: 1, justifyContent: "center" }}
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {mode === "edit" && onDelete && (
            <button
              type="button"
              onClick={del}
              disabled={pending}
              style={{
                background: "transparent",
                color: "var(--danger)",
                border: "2px solid var(--danger)",
                padding: "10px 18px",
                fontFamily: "var(--font-ui)",
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: pending ? "default" : "pointer",
              }}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              background: "transparent",
              color: "var(--bone)",
              border: 0,
              padding: "10px 18px",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
