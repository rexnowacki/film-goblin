"use client";

import { useState, useTransition } from "react";
import { adminCreateInviteCode, adminRevokeInviteCode } from "@/lib/actions/invite-codes";
import type { InviteCodeWithOwner } from "@/lib/queries/invite-codes";

const BASE_URL = "https://film-goblin.vercel.app";

export function CreateInviteForm() {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setResult(null);
    setError(null);
    startTransition(async () => {
      const res = await adminCreateInviteCode(formData);
      if ("error" in res) {
        setError(res.error);
      } else {
        setResult(`${BASE_URL}/invite/${res.code}`);
      }
    });
  }

  return (
    <div style={{ background: "var(--void-2)", border: "1px solid #444", padding: 20, maxWidth: 480 }}>
      <div className="caps" style={{ fontSize: 11, marginBottom: 14, color: "var(--accent)" }}>Create Code</div>
      <form action={submit} style={{ display: "grid", gap: 12 }}>
        <label>
          <div className="caps" style={{ fontSize: 10, marginBottom: 5, color: "var(--muted)" }}>Label (optional)</div>
          <input
            name="label"
            type="text"
            placeholder="e.g. Discord drop"
            style={{
              width: "100%",
              padding: "8px 10px",
              background: "var(--void)",
              border: "1px solid #555",
              color: "var(--bone)",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
        </label>
        <label>
          <div className="caps" style={{ fontSize: 10, marginBottom: 5, color: "var(--muted)" }}>Max uses</div>
          <input
            name="max_uses"
            type="number"
            min={1}
            defaultValue={5}
            style={{
              width: 80,
              padding: "8px 10px",
              background: "var(--void)",
              border: "1px solid #555",
              color: "var(--bone)",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
            }}
          />
        </label>
        {error && <div style={{ color: "var(--danger)", fontSize: 12, fontStyle: "italic" }}>{error}</div>}
        <button
          type="submit"
          disabled={pending}
          className="btn btn-sm"
          style={{ justifySelf: "start" }}
        >
          {pending ? "Creating…" : "Create Code"}
        </button>
      </form>
      {result && (
        <div style={{ marginTop: 14, padding: 12, background: "var(--void)", border: "1px solid var(--accent)" }}>
          <div className="caps" style={{ fontSize: 10, color: "var(--accent)", marginBottom: 6 }}>New code ready:</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all", color: "var(--bone)" }}>
            {result}
          </div>
        </div>
      )}
    </div>
  );
}

export function RevokeButton({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      const res = await adminRevokeInviteCode(code);
      setState(res.error ? "error" : "done");
    });
  }

  if (state === "done") {
    return <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)" }}>Revoked</span>;
  }

  return (
    <button
      type="button"
      onClick={revoke}
      disabled={pending}
      className="btn btn-sm"
      style={{ background: "transparent", color: "var(--danger)", borderColor: "var(--danger)", fontSize: 10 }}
    >
      {state === "error" ? "Error" : pending ? "…" : "Revoke"}
    </button>
  );
}
