import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?redirect=/auth/change-password");

  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password,username")
    .eq("id", user.id)
    .single();

  // If the flag isn't set, the user shouldn't be here. Send them to /home.
  if (!profile?.must_change_password) redirect("/home");

  return (
    <main style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100dvh", display: "grid", placeItems: "center", padding: 40 }}>
      <div
        style={{
          background: "var(--bone)",
          color: "var(--void)",
          border: "3px solid var(--void)",
          padding: "clamp(24px, 6vw, 40px) clamp(20px, 5vw, 32px)",
          boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--danger)",
          maxWidth: 420,
          width: "100%",
        }}
        className="grain-light"
      >
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ One more step</div>
        <h1 className="display" style={{ fontSize: 44, margin: "0 0 16px", lineHeight: 0.9 }}>
          Set a new password.
        </h1>
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 14,
            lineHeight: 1.5,
            opacity: 0.75,
            margin: "0 0 24px",
          }}
        >
          Your password was reset by an admin. Pick a new one to continue.
        </p>
        <ChangePasswordForm />
        <form action={signOut} style={{ marginTop: 18 }}>
          <button
            type="submit"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--void)",
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 12,
              opacity: 0.55,
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            Sign out instead
          </button>
        </form>
      </div>
    </main>
  );
}
