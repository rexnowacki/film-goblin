"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminDeleteUser } from "@/lib/actions/admin/users";

interface Props {
  userId: string;
  username: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

function isTestUser(createdAt: string, lastSignInAt: string | null): boolean {
  if (lastSignInAt) return false;
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs < 24 * 60 * 60 * 1000;
}

export default function DeleteUserModal({ userId, username, email, createdAt, lastSignInAt }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const testShape = isTestUser(createdAt, lastSignInAt);

  async function onConfirm() {
    if (!testShape && typed !== username) return;
    setSubmitting(true);
    setErr(null);
    const res = await adminDeleteUser(userId);
    setSubmitting(false);
    if (!res.ok) { setErr(res.error); return; }
    setOpen(false);
    router.push("/admin/users");
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-sm"
        style={{ background: "transparent", color: "var(--danger)", borderColor: "var(--danger)" }}
        onClick={() => { setOpen(true); setTyped(""); setErr(null); }}
      >
        {testShape ? "Delete test user" : "Delete user"}
      </button>
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "grid", placeItems: "center", padding: 20 }}>
          <div className="theme-paper-panel" style={{ background: "var(--bone)", color: "var(--void)", border: "3px solid var(--void)", boxShadow: "6px 6px 0 var(--danger)", padding: 22, maxWidth: 480, width: "100%" }}>
            {testShape ? (
              <>
                <div className="head" style={{ fontSize: 22, marginBottom: 10 }}>Delete @{username}?</div>
                <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginBottom: 16 }}>
                  This user has never signed in and was created within the last 24 hours.
                </p>
              </>
            ) : (
              <>
                <div className="head" style={{ fontSize: 22, marginBottom: 10 }}>Permanently delete @{username}</div>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, marginBottom: 10 }}>
                  <strong>Email:</strong> {email ?? "—"}<br />
                  <strong>Joined:</strong> {new Date(createdAt).toISOString().slice(0, 10)}
                </p>
                <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginBottom: 12 }}>
                  Watchlist entries, reviews, recommendations, coven memberships, follows, and activity entries all cascade-delete. This cannot be undone.
                </p>
                <label style={{ display: "block", marginBottom: 16 }}>
                  <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Type <code>{username}</code> to confirm</div>
                  <input
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    style={{ width: "100%", padding: 10, background: "white", border: "2px solid var(--void)", color: "var(--void)", fontFamily: "var(--font-ui)", fontSize: 14 }}
                    autoFocus
                  />
                </label>
              </>
            )}
            {err && <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-sm btn-outline" style={{ color: "var(--void)", borderColor: "var(--void)" }} onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{ background: "var(--danger)", color: "var(--danger-ink)", borderColor: "var(--danger)", opacity: (!testShape && typed !== username) ? 0.4 : 1 }}
                onClick={onConfirm}
                disabled={submitting || (!testShape && typed !== username)}
              >
                {submitting ? "Deleting…" : "Delete user"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
