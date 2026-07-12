"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { HomeIcon, DiscoverIcon, CovenIcon, CollectionsIcon } from "./BottomNavIcons";

type TabId = "feed" | "discovery" | "coven" | "hoard";
type Tab = { id: TabId; label: string; href: string; Icon: typeof HomeIcon };

const tabs: readonly Tab[] = [
  { id: "feed", label: "Feed", href: "/home", Icon: HomeIcon },
  { id: "discovery", label: "Discover", href: "/films", Icon: DiscoverIcon },
  { id: "coven", label: "Coven", href: "/coven", Icon: CovenIcon },
  { id: "hoard", label: "Hoard", href: "/watchlist", Icon: CollectionsIcon },
];

export const NAVIGATION_FALLBACK_MS = 1800;

export default function BottomNavClient({ active }: { active: TabId | null }) {
  const pathname = usePathname();
  const [pending, setPending] = useState<TabId | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPending(null);
    if (watchdog.current) clearTimeout(watchdog.current);
  }, [pathname]);

  useEffect(() => () => {
    if (watchdog.current) clearTimeout(watchdog.current);
  }, []);

  function acknowledgeNavigation(tab: Tab) {
    if (pathname === tab.href) return;
    setPending(tab.id);
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = setTimeout(() => {
      if (window.location.pathname !== tab.href) window.location.assign(tab.href);
    }, NAVIGATION_FALLBACK_MS);
  }

  const selected = pending ?? active;

  return (
    <nav className="bottom-nav" aria-label="Primary" aria-busy={pending !== null}>
      {tabs.map(tab => (
        <Link
          key={tab.id}
          href={tab.href}
          prefetch={false}
          className={`bottom-nav__item${pending === tab.id ? " is-pending" : ""}`}
          aria-current={selected === tab.id ? "page" : undefined}
          onClick={() => acknowledgeNavigation(tab)}
        >
          <tab.Icon className="bottom-nav__icon" />
          <span className="bottom-nav__label">{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
