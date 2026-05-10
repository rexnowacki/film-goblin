"use client";

import { useState } from "react";
import { adminSendPasswordReset } from "@/lib/actions/admin/users";

interface Props {
  userId: string;
}

export default function ResetPasswordButton({ userId }: Props) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function handleClick() {
    if (state === "sending") return;
    setState("sending");
    const result = await adminSendPasswordReset(userId);
    if (result.ok) {
      setState("sent");
    } else {
      setErrMsg(result.error);
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--accent)", margin: 0 }}>
        Password reset email sent.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        className="btn btn-sm btn-outline"
        onClick={handleClick}
        disabled={state === "sending"}
      >
        {state === "sending" ? "Sending…" : "Send password reset email"}
      </button>
      {state === "error" && errMsg && (
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--danger)", margin: 0 }}>
          {errMsg}
        </p>
      )}
    </div>
  );
}
