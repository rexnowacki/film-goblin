"use client";

import { useState } from "react";
import { adminForcePasswordChange } from "@/lib/actions/admin/users";

interface Props {
  userId: string;
  username: string;
}

export default function SetTempPasswordForm({ userId, username }: Props) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "submitting") return;
    if (pw.length < 6) {
      setErrMsg("Temp password must be at least 6 characters.");
      setState("error");
      return;
    }
    setState("submitting");
    setErrMsg(null);
    const res = await adminForcePasswordChange(userId, pw);
    if (res.ok) {
      setState("done");
    } else {
      setErrMsg(res.error);
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--accent)", margin: 0 }}>
        Temp password set. Tell @{username} to use it on their next login — they'll be forced to pick a new one.
      </p>
    );
  }

  if (!open) {
    return (
      <button className="btn btn-sm btn-outline" onClick={() => setOpen(true)}>
        Set temp password
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        type="text"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="temp password (min 6)"
        autoComplete="off"
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 13,
          padding: "8px 10px",
          border: "2px solid var(--void)",
          background: "var(--bone)",
          color: "var(--void)",
        }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="submit"
          className="btn btn-sm btn-dark"
          disabled={state === "submitting" || pw.length < 6}
        >
          {state === "submitting" ? "Saving…" : "Set temp password"}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => { setOpen(false); setPw(""); setState("idle"); setErrMsg(null); }}
        >
          Cancel
        </button>
      </div>
      {state === "error" && errMsg && (
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--danger)", margin: 0 }}>
          {errMsg}
        </p>
      )}
      <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, opacity: 0.65, margin: "4px 0 0" }}>
        Share this temp password with @{username} out-of-band. They'll be redirected to set a new one on next login.
      </p>
    </form>
  );
}
