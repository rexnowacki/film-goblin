"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/actions/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";

function SignInInner() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const redirectTo = params.get("redirect") || "/home";
  const prefilledEmail = params.get("email") || "";

  async function handle(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await signIn(formData);
    setPending(false);
    if (res?.error) setError(res.error);
  }

  return (
    <main style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100vh", display: "grid", placeItems: "center", padding: 40 }}>
      <div style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)", padding: "clamp(24px, 6vw, 40px) clamp(20px, 5vw, 32px)",
        boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--accent)",
        transform: "rotate(var(--card-rotation))",
        maxWidth: 420, width: "100%",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Enter The Coven</div>
        <h1 className="display" style={{ fontSize: 48, margin: "0 0 24px", lineHeight: 0.9 }}>Sign In</h1>

        <GoogleSignInButton />

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0", color: "var(--muted)", fontFamily: "var(--font-ui)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          <span style={{ flex: 1, height: 1, background: "var(--muted)" }} />
          or
          <span style={{ flex: 1, height: 1, background: "var(--muted)" }} />
        </div>

        <form action={handle}>
          <input type="hidden" name="redirect" value={redirectTo} />
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Email</div>
          <input name="email" type="email" required autoComplete="email" defaultValue={prefilledEmail}
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Password</div>
          <input name="password" type="password" required minLength={6} autoComplete="current-password"
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 8, fontFamily: "var(--font-ui)" }} />
          <div style={{ marginBottom: 20 }}>
            <a href="/auth/forgot" style={{ color: "var(--accent-deep)", fontSize: 13, fontStyle: "italic", textDecoration: "underline" }}>
              Forgot password?
            </a>
          </div>
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
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
