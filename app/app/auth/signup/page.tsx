"use client";

import { useState } from "react";
import { signUp } from "@/lib/actions/auth";

export default function SignUpPage() {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handle(formData: FormData) {
    setPending(true);
    setError(null);
    setInfo(null);
    formData.set("origin", window.location.origin);
    const res = await signUp(formData);
    setPending(false);
    if (res?.error) setError(res.error);
    if (res?.info) setInfo(res.info);
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
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ The Initiation</div>
        <h1 className="display" style={{ fontSize: 48, margin: "0 0 24px", lineHeight: 0.9 }}>Sign Up</h1>
        <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Email</div>
        <input name="email" type="email" required autoComplete="email"
          style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
        <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Password (min 6)</div>
        <input name="password" type="password" required minLength={6} autoComplete="new-password"
          style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 20, fontFamily: "var(--font-ui)" }} />
        {error && (
          <div style={{ color: "var(--blood)", fontFamily: "var(--font-serif)", fontStyle: "italic", marginBottom: 16 }}>
            {error}
          </div>
        )}
        {info && (
          <div style={{ color: "var(--accent-deep)", fontFamily: "var(--font-serif)", fontStyle: "italic", marginBottom: 16 }}>
            {info}
          </div>
        )}
        <button type="submit" disabled={pending} className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }}>
          {pending ? "Binding…" : "✦ Agree And Seal"}
        </button>
      </form>
    </main>
  );
}
