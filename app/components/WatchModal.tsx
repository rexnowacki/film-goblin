"use client";

import { useState, useTransition } from "react";
import BottomSheet from "./BottomSheet";

interface SaveValues {
  watched_at: string;
  note: string;
  recommended: boolean | null;
}

interface Props {
  open: boolean;
  mode: "new" | "edit";
  initial: { watched_at: string; note: string; recommended: boolean | null; id?: string };
  filmTitle: string;
  onSave(values: SaveValues): Promise<void>;
  onDelete?(): Promise<void>;
  onClose(): void;
}

const MAX_NOTE = 500;

export default function WatchModal({ open, mode, initial, filmTitle, onSave, onDelete, onClose }: Props) {
  const [watchedAt, setWatchedAt] = useState(initial.watched_at);
  const [note, setNote] = useState(initial.note);
  const [recommended, setRecommended] = useState<boolean | null>(initial.recommended);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      setError(null);
      try {
        await onSave({ watched_at: watchedAt, note, recommended });
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
      <div style={{ display: "grid", gap: 14 }}>
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
              <span style={{ color: note.length >= 500 ? "var(--blood)" : "var(--muted)" }}>
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
        <div>
          <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Verdict (optional)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { value: true, label: "Loved it" },
              { value: false, label: "Didn't love it" },
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
                    background: active ? (opt.value ? "var(--accent)" : "var(--blood)") : "transparent",
                    color: active ? (opt.value ? "var(--accent-ink)" : "var(--bone)") : "var(--bone)",
                    border: `2px solid ${active ? (opt.value ? "var(--accent)" : "var(--blood)") : "var(--muted)"}`,
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
        {error && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13 }}>{error}</div>}
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
                color: "var(--blood)",
                border: "2px solid var(--blood)",
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
