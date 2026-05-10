"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signUp, checkUsernameAvailability } from "@/lib/actions/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";

const USERNAME_RE = /^[a-z0-9._]+$/;
type CheckState = "idle" | "checking" | "ok" | "taken" | "invalid";

function SignUpInner() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [pending, setPending] = useState(false);
  const [username, setUsername] = useState("");
  const [check, setCheck] = useState<CheckState>("idle");
  const reqIdRef = useRef(0);
  const redirectTo = params.get("redirect") || "/home";
  const inviteRaw = params.get("invite");
  const invite = inviteRaw && /^[a-z0-9._]+$/.test(inviteRaw) ? inviteRaw : null;

  useEffect(() => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) {
      setCheck("idle");
      return;
    }
    if (trimmed.length > 24 || !USERNAME_RE.test(trimmed)) {
      setCheck("invalid");
      return;
    }
    setCheck("checking");
    const myReq = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      try {
        const { status } = await checkUsernameAvailability(trimmed);
        if (myReq !== reqIdRef.current) return; // stale response
        setCheck(status);
      } catch {
        if (myReq !== reqIdRef.current) return;
        setCheck("idle"); // network blip — let submit-time check be the source of truth
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [username]);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    setInfo(null);
    setDuplicate(false);
    const res = await signUp(formData);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      if (res.duplicate) setDuplicate(true);
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
          {invite && <input type="hidden" name="invite" value={invite} />}
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Username</div>
          <input
            name="username"
            type="text"
            required
            maxLength={24}
            autoComplete="username"
            placeholder="toothtony"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 6, fontFamily: "var(--font-ui)" }}
          />
          <UsernameStatus state={check} />
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", opacity: 0.6, marginBottom: 20 }}>
            Lowercase letters, numbers, dots, underscores. This is your @. Add a display name later in settings.
          </div>
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Password (min 6)</div>
          <input name="password" type="password" required minLength={6} autoComplete="new-password"
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 6, fontFamily: "var(--font-ui)" }} />
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", opacity: 0.6, marginBottom: 20 }}>
            Email is optional — add one later from settings if you want price-drop alerts by email.
          </div>
          {error && (
            <div style={{ color: "var(--danger)", fontFamily: "var(--font-serif)", fontStyle: "italic", marginBottom: 8 }}>
              {error}
            </div>
          )}
          {duplicate && (
            <div style={{ marginBottom: 16 }}>
              <a href={`/auth/signin?redirect=${encodeURIComponent(redirectTo)}`}
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
          <button
            type="submit"
            disabled={pending || check === "checking" || check === "taken" || check === "invalid"}
            className="btn btn-dark btn-lg"
            style={{ width: "100%", justifyContent: "center" }}
          >
            {pending ? "Binding…" : "✦ Agree And Seal"}
          </button>
        </form>
      </div>
    </main>
  );
}

function UsernameStatus({ state }: { state: CheckState }) {
  if (state === "idle") return null;
  const base = {
    fontFamily: "var(--font-serif)",
    fontStyle: "italic" as const,
    fontSize: 12,
    marginBottom: 8,
    minHeight: 16,
  };
  if (state === "checking") return <div style={{ ...base, color: "var(--muted)" }}>Checking…</div>;
  if (state === "ok") return <div style={{ ...base, color: "var(--accent-deep)" }}>✓ Available</div>;
  if (state === "taken") return <div style={{ ...base, color: "var(--danger)" }}>✕ Already taken</div>;
  return <div style={{ ...base, color: "var(--danger)" }}>Lowercase letters, numbers, dots, underscores only.</div>;
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpInner />
    </Suspense>
  );
}
