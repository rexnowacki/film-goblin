"use client";

import { Suspense, useEffect, useState } from "react";
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
  const [displayName, setDisplayName] = useState("");
  const [usernameValue, setUsernameValue] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const redirectTo = params.get("redirect") || "/home";

  useEffect(() => {
    if (usernameEdited) return;
    const suggested = displayName.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 24);
    setUsernameValue(suggested);
  }, [displayName, usernameEdited]);

  async function submit(formData: FormData) {
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
    <main style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100dvh", display: "grid", placeItems: "center", padding: 40 }}>
      <div style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)", padding: "clamp(24px, 6vw, 40px) clamp(20px, 5vw, 32px)",
        boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--accent)",
        transform: "rotate(var(--card-rotation))",
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

        <form action={submit}>
          <input type="hidden" name="redirect" value={redirectTo} />
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Email</div>
          <input name="email" type="email" required autoComplete="email"
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Password (min 6)</div>
          <input name="password" type="password" required minLength={6} autoComplete="new-password"
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Display Name</div>
          <input
            name="display_name"
            type="text"
            required
            maxLength={40}
            autoComplete="nickname"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Tooth Tony"
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }}
          />
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Username</div>
          <input
            name="username"
            type="text"
            required
            maxLength={24}
            autoComplete="username"
            value={usernameValue}
            onChange={e => { setUsernameValue(e.target.value); setUsernameEdited(true); }}
            placeholder="toothtony"
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 6, fontFamily: "var(--font-ui)" }}
          />
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", opacity: 0.6, marginBottom: 20 }}>
            Lowercase letters, numbers, dots, underscores. This is your @.
          </div>
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
