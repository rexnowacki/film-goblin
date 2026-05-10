"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { resetPassword } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
      } else {
        setTokenError("This reset link has expired or is invalid.");
      }
    })();
  }, []);

  async function handle(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await resetPassword(formData);
    setPending(false);
    if (res?.error) { setError(res.error); return; }
    if (res?.ok) router.push("/home");
  }

  return (
    <main style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100dvh", display: "grid", placeItems: "center", padding: 40 }}>
      <div style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)", padding: "clamp(24px, 6vw, 40px) clamp(20px, 5vw, 32px)",
        boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--accent)",
        transform: "rotate(var(--card-rotation))",
        maxWidth: 420, width: "100%",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ New Rune</div>
        <h1 className="display" style={{ fontSize: 48, margin: "0 0 16px", lineHeight: 0.9 }}>Choose a password</h1>
        {tokenError ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.5 }}>
            <p>{tokenError}</p>
            <p style={{ marginTop: 12 }}>
              <a href="/auth/forgot" style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>Request a new link</a>
            </p>
          </div>
        ) : !ready ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>Loading…</div>
        ) : (
          <form action={handle}>
            <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>New password</div>
            <input name="new_password" type="password" required minLength={6} autoComplete="new-password"
              style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
            <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Confirm</div>
            <input name="confirm" type="password" required minLength={6} autoComplete="new-password"
              style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 20, fontFamily: "var(--font-ui)" }} />
            {error && (
              <div style={{ color: "var(--danger)", fontFamily: "var(--font-serif)", fontStyle: "italic", marginBottom: 16 }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={pending} className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }}>
              {pending ? "Sealing…" : "✦ Set new password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
