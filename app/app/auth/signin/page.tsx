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
  const prefilledIdentifier = params.get("identifier") || params.get("email") || "";

  async function handle(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await signIn(formData);
    setPending(false);
    if (res?.error) setError(res.error);
  }

  return (
    <main className="signin-page">
      <a className="signin-brand" href="/" aria-label="Film Goblin home">
        Film<span>Goblin</span>
      </a>

      <div className="signin-shell">
        <section className="signin-oracle" aria-labelledby="signin-welcome-title">
          <div className="signin-oracle__copy">
            <div className="eyebrow">The pit kept your place</div>
            <h1 id="signin-welcome-title">Come back<br />to the dark.</h1>
            <p>Your watchlist is waiting. Your coven has been whispering. The next strange thing is already looking for you.</p>
          </div>
          <img src="/add-film-oracle.png" alt="A goblin peering over an enchanted crystal ball" />
          <div className="signin-oracle__seal" aria-hidden="true">✦</div>
        </section>

        <section className="signin-card grain-light" aria-labelledby="signin-form-title">
          <div className="eyebrow">Enter the coven</div>
          <h2 id="signin-form-title">Sign in</h2>
          <p className="signin-card__lede">Speak the old name. The door remembers.</p>

        <GoogleSignInButton />

        <div className="signin-divider">
          <span />
          or use the old rite
          <span />
        </div>

        <form action={handle} className="signin-form">
          <input type="hidden" name="redirect" value={redirectTo} />
          <label className="caps" htmlFor="signin-identifier">Username or email</label>
          <input name="identifier" type="text" required autoComplete="username" defaultValue={prefilledIdentifier}
            id="signin-identifier" placeholder="moss.witch" />
          <div className="signin-form__password-label">
            <label className="caps" htmlFor="signin-password">Password</label>
            <a href="/auth/forgot">Forgot it?</a>
          </div>
          <input id="signin-password" name="password" type="password" required minLength={6} autoComplete="current-password" />
          {error && (
            <div className="signin-form__error" role="alert">
              {error}
            </div>
          )}
          <button type="submit" disabled={pending} className="btn btn-dark btn-lg signin-form__submit">
            {pending ? "Summoning…" : "Enter the pit →"}
          </button>
          <div className="signin-form__join">
            No place in the pit yet? <a href="/auth/signup">Begin the initiation →</a>
          </div>
        </form>
        </section>
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
