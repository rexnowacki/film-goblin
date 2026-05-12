import { signOut } from "@/lib/actions/auth";

export default function SignOutSection() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        style={{
          background: "transparent",
          color: "var(--danger)",
          border: "2px solid var(--danger)",
          padding: "10px 18px",
          fontFamily: "var(--font-ui)",
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </form>
  );
}
