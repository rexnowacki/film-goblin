import { HomeIcon, DiscoverIcon, CovenIcon, CollectionsIcon } from "../BottomNavIcons";

export default function BottomNavSkeleton() {
  const tabs = [
    { label: "Feed", href: "/home", Icon: HomeIcon },
    { label: "Discover", href: "/films", Icon: DiscoverIcon },
    { label: "Coven", href: "/coven", Icon: CovenIcon },
    { label: "Hoard", href: "/watchlist", Icon: CollectionsIcon },
  ];

  return (
    <nav className="bottom-nav" aria-label="Primary" data-loading="true">
      {tabs.map(tab => (
        <a key={tab.href} href={tab.href} className="bottom-nav__item">
          <tab.Icon className="bottom-nav__icon" />
          <span className="bottom-nav__label">{tab.label}</span>
        </a>
      ))}
    </nav>
  );
}
