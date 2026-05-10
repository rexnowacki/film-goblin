"use client";

import { useState } from "react";
import { deleteAccount } from "@/lib/actions/auth";

export default function DeleteAccountSection({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    if (typed !== username) return;
    setPending(true);
    setError(null);
    const res = await deleteAccount();
    setPending(false);
    if (res?.error) setError(res.error);
    // on success the server action redirects — no client handling needed
  }

  return (
    <div style={{ marginTop: 48, borderTop: "1px solid var(--danger)", paddingTop: 24 }}>
      <div className="caps" style={{ fontSize: 11, marginBottom: 12, color: "var(--danger)" }}>Danger zone</div>

      {!open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setTyped(""); setError(null); }}
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
            cursor: "pointer",
          }}
        >
          Delete account
        </button>
      ) : (
        <div style={{ maxWidth: 420, display: "grid", gap: 12 }}>
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            This permanently deletes your account, watchlist, library, coven memberships, recommendations, and all activity.
            It cannot be undone.
          </p>
          <label>
            <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>
              Type <code style={{ fontFamily: "var(--font-mono)", background: "var(--void-2)", padding: "1px 5px" }}>{username}</code> to confirm
            </div>
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              style={{
                width: "100%",
                padding: 10,
                background: "var(--void-2)",
                border: "2px solid var(--danger)",
                color: "var(--bone)",
                fontFamily: "var(--font-ui)",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </label>
          {error && (
            <div style={{ color: "var(--danger)", fontStyle: "italic", fontSize: 13 }}>{error}</div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              style={{
                background: "transparent",
                color: "var(--bone)",
                border: "2px solid #555",
                padding: "9px 16px",
                fontFamily: "var(--font-ui)",
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || typed !== username}
              style={{
                background: "var(--danger)",
                color: "var(--bone)",
                border: "2px solid var(--danger)",
                padding: "9px 16px",
                fontFamily: "var(--font-ui)",
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
                opacity: typed !== username ? 0.4 : 1,
              }}
            >
              {pending ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
