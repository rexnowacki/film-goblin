"use client";

import { useState } from "react";
import { signIn } from "@/lib/actions/auth";

export default function SignInPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handle(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await signIn(formData);
    setPending(false);
    if (res?.error) setError(res.error);
  }

  return (
    <main style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100vh", display: "grid", placeItems: "center", padding: 40 }}>
      <form action={handle} style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)", padding: "40px 32px",
        boxShadow: "12px 12px 0 var(--accent)",
        transform: "rotate(-0.5deg)",
        maxWidth: 420, width: "100%",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Enter The Coven</div>
        <h1 className="display" style={{ fontSize: 48, margin: "0 0 24px", lineHeight: 0.9 }}>Sign In</h1>
        <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Email</div>
        <input name="email" type="email" required autoComplete="email"
          style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
        <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Password</div>
        <input name="password" type="password" required minLength={6} autoComplete="current-password"
          style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 20, fontFamily: "var(--font-ui)" }} />
        {error && (
          <div style={{ color: "var(--blood)", fontFamily: "var(--font-serif)", fontStyle: "italic", marginBottom: 16 }}>
            {error}
          </div>
        )}
        <button type="submit" disabled={pending} className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }}>
          {pending ? "Summoning…" : "✦ Enter"}
        </button>
        <div style={{ marginTop: 16, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, textAlign: "center" }}>
          No coven? <a href="/auth/signup" style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>Join one</a>.
        </div>
      </form>
    </main>
  );
}
