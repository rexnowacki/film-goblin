"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeForcedPasswordChange } from "@/lib/actions/auth";

export default function ChangePasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await completeForcedPasswordChange(formData);
    if (res?.error) {
      setError(res.error);
      setPending(false);
      return;
    }
    if (res?.ok) {
      router.replace("/home");
      router.refresh();
    }
  }

  return (
    <form action={submit}>
      <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>New Password (min 6)</div>
      <input
        name="new_password"
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }}
      />
      <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Confirm New Password</div>
      <input
        name="confirm"
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }}
      />
      {error && (
        <div style={{ color: "var(--danger)", fontFamily: "var(--font-serif)", fontStyle: "italic", marginBottom: 12 }}>
          {error}
        </div>
      )}
      <button type="submit" disabled={pending} className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }}>
        {pending ? "Saving…" : "✦ Set New Password"}
      </button>
    </form>
  );
}
