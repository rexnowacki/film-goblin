import Link from "next/link";

export default function InviteExpiredPage() {
  return (
    <main
      style={{
        background: "var(--bone)",
        color: "var(--void)",
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 40,
        fontFamily: "var(--font-ui)",
      }}
    >
      <div
        style={{
          border: "3px solid var(--void)",
          padding: "clamp(24px, 6vw, 40px) clamp(20px, 5vw, 32px)",
          boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--blood)",
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
        }}
        className="grain-light"
      >
        <div className="eyebrow" style={{ marginBottom: 12 }}>✦ Film Goblin</div>
        <h1
          className="display"
          style={{ fontSize: "clamp(32px, 7vw, 56px)", margin: "0 0 16px", lineHeight: 0.9 }}
        >
          Invite expired.
        </h1>
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 15,
            lineHeight: 1.5,
            opacity: 0.75,
            margin: "0 0 28px",
          }}
        >
          This invite link is no longer valid — it may have been used up or revoked.
          Ask the person who sent it to share a fresh one.
        </p>
        <Link href="/" className="btn btn-dark" style={{ textDecoration: "none" }}>
          ← Back to Film Goblin
        </Link>
      </div>
    </main>
  );
}
