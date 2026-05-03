import Link from "next/link";
import { getServerUser } from "@/lib/supabase/cached";
import { HomeIcon, DiscoverIcon, CovenIcon, CollectionsIcon, ForYouIcon } from "./BottomNavIcons";

interface Props {
  current?: string; // shares the existing 6-id space used by TopNav
}

const HOARD_IDS = new Set(["watchlist", "library", "watched"]);

function activeTab(current: string | undefined): "feed" | "for-you" | "discovery" | "coven" | "hoard" | null {
  if (current === "home") return "feed";
  if (current === "for-you") return "for-you";
  if (current === "films") return "discovery";
  if (current === "coven") return "coven";
  if (current && HOARD_IDS.has(current)) return "hoard";
  return null;
}

export default async function BottomNav({ current }: Props) {
  const user = await getServerUser();
  if (!user) return null; // anon viewers: no bottom nav

  const active = activeTab(current);
  const tabs = [
    { id: "feed",      label: "Feed",      href: "/home",      Icon: HomeIcon },
    { id: "for-you",   label: "For You",   href: "/for-you",   Icon: ForYouIcon },
    { id: "discovery", label: "Discovery", href: "/films",     Icon: DiscoverIcon },
    { id: "coven",     label: "Coven",     href: "/coven",     Icon: CovenIcon },
    { id: "hoard",     label: "Hoard",     href: "/watchlist", Icon: CollectionsIcon },
  ] as const;

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {tabs.map(t => (
        <Link
          key={t.id}
          href={t.href}
          prefetch={false}
          className="bottom-nav__item"
          aria-current={active === t.id ? "page" : undefined}
        >
          <t.Icon className="bottom-nav__icon" />
          <span className="bottom-nav__label">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
