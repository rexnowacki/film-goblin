"use client";

import { useState, useTransition } from "react";
import { setInviteGate } from "@/lib/actions/admin/site-settings";

export default function SiteSettingsClient({
  enabled,
  updatedAt,
}: {
  enabled: boolean;
  updatedAt: string | null;
}) {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setError(null);
    setOn(next); // optimistic
    startTransition(async () => {
      try {
        await setInviteGate(next);
      } catch {
        setOn(!next); // revert on failure
        setError("Couldn't save. Try again.");
      }
    });
  }

  return (
    <div
      style={{
        padding: 22,
        border: "2px solid var(--bone)",
        background: "var(--void-2)",
        maxWidth: 520,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div className="head" style={{ fontSize: 22, marginBottom: 4 }}>Invite gating</div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, opacity: 0.8 }}>
            When on, new signups require a valid invite link.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Invite gating"
          disabled={pending}
          onClick={toggle}
          style={{
            position: "relative",
            width: 54,
            height: 30,
            flexShrink: 0,
            borderRadius: 999,
            border: "2px solid var(--bone)",
            background: on ? "var(--accent)" : "var(--void-3)",
            cursor: pending ? "wait" : "pointer",
            transition: "background 120ms ease",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: on ? 26 : 2,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "var(--bone)",
              transition: "left 120ms ease",
            }}
          />
        </button>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>
        Status: <strong>{on ? "ON — invite required" : "OFF — open signup"}</strong>
        {updatedAt ? <> · last changed {new Date(updatedAt).toLocaleString()}</> : null}
      </div>

      {error ? (
        <div style={{ marginTop: 10, color: "var(--danger)", fontSize: 13 }}>{error}</div>
      ) : null}
    </div>
  );
}
