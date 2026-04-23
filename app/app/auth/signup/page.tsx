"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signUp } from "@/lib/actions/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";

function SignUpInner() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [dupEmail, setDupEmail] = useState("");
  const [pending, setPending] = useState(false);
  const redirectTo = params.get("redirect") || "/home";

  async function handle(formData: FormData) {
    setPending(true);
    setError(null);
    setInfo(null);
    setDuplicate(false);
    formData.set("origin", window.location.origin);
    const res = await signUp(formData);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      if (res.duplicate) {
        setDuplicate(true);
        setDupEmail(String(formData.get("email") || ""));
      }
    }
    if (res?.info) setInfo(res.info);
  }

  return (
    <main style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100vh", display: "grid", placeItems: "center", padding: 40 }}>
      <div style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)", padding: "40px 32px",
        boxShadow: "12px 12px 0 var(--accent)",
        transform: "rotate(-0.5deg)",
        maxWidth: 420, width: "100%",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ The Initiation</div>
        <h1 className="display" style={{ fontSize: 48, margin: "0 0 24px", lineHeight: 0.9 }}>Sign Up</h1>

        <GoogleSignInButton />

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0", color: "var(--muted)", fontFamily: "var(--font-ui)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          <span style={{ flex: 1, height: 1, background: "var(--muted)" }} />
          or
          <span style={{ flex: 1, height: 1, background: "var(--muted)" }} />
        </div>

        <form action={handle}>
          <input type="hidden" name="redirect" value={redirectTo} />
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Email</div>
          <input name="email" type="email" required autoComplete="email"
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Password (min 6)</div>
          <input name="password" type="password" required minLength={6} autoComplete="new-password"
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 20, fontFamily: "var(--font-ui)" }} />
          {error && (
            <div style={{ color: "var(--blood)", fontFamily: "var(--font-serif)", fontStyle: "italic", marginBottom: 8 }}>
              {error}
            </div>
          )}
          {duplicate && (
            <div style={{ marginBottom: 16 }}>
              <a href={`/auth/signin?email=${encodeURIComponent(dupEmail)}&redirect=${encodeURIComponent(redirectTo)}`}
                 style={{ color: "var(--accent-deep)", textDecoration: "underline", fontStyle: "italic" }}>
                Go to sign-in →
              </a>
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
      </div>
    </main>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpInner />
    </Suspense>
  );
}
