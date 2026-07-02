import Link from "next/link";

export default function DiscoverTabs({ active }: { active: "for-you" | "browse" }) {
  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: "8px 16px",
    fontSize: 11,
    fontFamily: "var(--font-ui)",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textDecoration: "none",
    color: isActive ? "var(--accent-ink)" : "var(--bone)",
    background: isActive ? "var(--accent)" : "transparent",
    border: "2px solid var(--accent)",
  });
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 20 }} className="caps">
      <Link href="/films" prefetch={false} style={tabStyle(active === "for-you")}
        aria-current={active === "for-you" ? "page" : undefined}>
        For You
      </Link>
      <Link href="/films?tab=browse" prefetch={false} style={tabStyle(active === "browse")}
        aria-current={active === "browse" ? "page" : undefined}>
        Browse All
      </Link>
    </div>
  );
}
