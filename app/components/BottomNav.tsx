import { getServerUser } from "@/lib/supabase/cached";
import { HomeIcon, DiscoverIcon, CovenIcon, CollectionsIcon } from "./BottomNavIcons";

interface Props {
  current?: string; // shares the existing 6-id space used by TopNav
}

const HOARD_IDS = new Set(["watchlist", "library", "watched"]);

type TabId = "feed" | "discovery" | "coven" | "hoard";
type Tab = { id: TabId; label: string; href: string; Icon: typeof HomeIcon };

const tabs: readonly Tab[] = [
  { id: "feed", label: "Feed", href: "/home", Icon: HomeIcon },
  { id: "discovery", label: "Discover", href: "/films", Icon: DiscoverIcon },
  { id: "coven", label: "Coven", href: "/coven", Icon: CovenIcon },
  { id: "hoard", label: "Hoard", href: "/watchlist", Icon: CollectionsIcon },
];

function activeTab(current: string | undefined): TabId | null {
  if (current === "home") return "feed";
  if (current === "films") return "discovery";
  if (current === "coven") return "coven";
  if (current && HOARD_IDS.has(current)) return "hoard";
  return null;
}

export default async function BottomNav({ current }: Props) {
  const user = await getServerUser();
  if (!user) return null; // anon viewers: no bottom nav

  const active = activeTab(current);
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {tabs.map(tab => (
        // Deliberately bypass Next's client router: route loading unmounts this
        // page-owned nav, which canceled its old hard-navigation fallback on iOS.
        <a
          key={tab.id}
          href={tab.href}
          className="bottom-nav__item"
          aria-current={active === tab.id ? "page" : undefined}
        >
          <tab.Icon className="bottom-nav__icon" />
          <span className="bottom-nav__label">{tab.label}</span>
        </a>
      ))}
    </nav>
  );
}
