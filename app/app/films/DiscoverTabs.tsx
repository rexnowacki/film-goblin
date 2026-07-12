import Link from "next/link";

export default function DiscoverTabs({ active }: { active: "for-you" | "browse" }) {
  return (
    <nav className="discover-mode-tabs" aria-label="Discover mode">
      <Link href="/films" prefetch={false} className="discover-mode-tab"
        aria-current={active === "for-you" ? "page" : undefined}>
        <span aria-hidden="true">✦</span> For You
      </Link>
      <Link href="/films?tab=browse" prefetch={false} className="discover-mode-tab"
        aria-current={active === "browse" ? "page" : undefined}>
        <span aria-hidden="true">◇</span> Browse the Pit
      </Link>
    </nav>
  );
}
