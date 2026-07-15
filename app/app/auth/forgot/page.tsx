"use client";

import { useState } from "react";
import { sendPasswordReset } from "@/lib/actions/auth";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handle(formData: FormData) {
    setPending(true);
    formData.set("origin", window.location.origin);
    const res = await sendPasswordReset(formData);
    setPending(false);
    setMessage(res.message);
  }

  return (
    <main className="auth-paper-canvas" style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100dvh", display: "grid", placeItems: "center", padding: 40 }}>
      <div style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)", padding: "clamp(24px, 6vw, 40px) clamp(20px, 5vw, 32px)",
        boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--accent)",
        transform: "rotate(var(--card-rotation))",
        maxWidth: 420, width: "100%",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Recovery</div>
        <h1 className="display" style={{ fontSize: 48, margin: "0 0 16px", lineHeight: 0.9 }}>Forgot password?</h1>
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
          Enter your email. We'll send a link to reset it.
        </p>
        <form action={handle}>
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Email</div>
          <input name="email" type="email" required autoComplete="email"
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
          {message && (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--accent-deep)", marginBottom: 16 }}>
              {message}
            </div>
          )}
          <button type="submit" disabled={pending} className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }}>
            {pending ? "Sending…" : "✦ Send reset link"}
          </button>
          <div style={{ marginTop: 16, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, textAlign: "center" }}>
            <a href="/auth/signin" style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>Back to sign-in</a>
          </div>
        </form>
      </div>
    </main>
  );
}
