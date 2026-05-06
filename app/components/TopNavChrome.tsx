"use client";

import { useState } from "react";
import Link from "next/link";
import UserMenu from "./UserMenu";
import NotificationBell from "./NotificationBell";
import BackButton from "./BackButton";
import AddFilmModal from "./AddFilmModal";
import type { NotificationFeedItem } from "@/lib/queries/notifications";

interface NavItem { id: string; label: string; href: string; badge?: number }
interface ProfileShape { username: string; display_name: string | null; avatar_url: string | null }

interface Props {
  items: NavItem[];
  current?: string;
  user: boolean;
  profile: ProfileShape | null;
  isAdmin: boolean;
  unreadNotifCount: number;
  notifItems: NotificationFeedItem[];
  showBack?: boolean;
}

export default function TopNavChrome({ items, current, user, profile, isAdmin, unreadNotifCount, notifItems, showBack }: Props) {
  const [addFilmOpen, setAddFilmOpen] = useState(false);
  return (
    <>
    <div style={{ borderBottom: "1px solid #2a2a2a", background: "var(--void-2)", position: "sticky", top: 0, zIndex: 20, paddingTop: "env(safe-area-inset-top)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", maxWidth: 1280, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28, minWidth: 0 }}>
          {showBack && <BackButton />}
          <Link href={user ? "/home" : "/"} prefetch={false} style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1, color: "var(--bone)", textDecoration: "none", flexShrink: 0 }}>
            Film<span style={{ color: "var(--accent)" }}>Goblin</span>
          </Link>
          <nav className="desktop-only" style={{ display: "flex", gap: 22 }}>
            {items.map(it => (
              <Link key={it.id} href={it.href} prefetch={false} className="caps" style={{
                fontSize: 11,
                color: current === it.id ? "var(--accent)" : "var(--bone)",
                borderBottom: current === it.id ? "2px solid var(--accent)" : "2px solid transparent",
                paddingBottom: 4,
                textDecoration: "none",
                position: "relative",
                whiteSpace: "nowrap",
              }}>
                {it.label}
                {it.badge && it.badge > 0 ? (
                  <span style={{ marginLeft: 6, padding: "1px 6px", background: "var(--accent)", color: "var(--accent-ink)", fontSize: 9, fontWeight: 700, borderRadius: 999 }}>
                    {it.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user ? (
            <>
              <NotificationBell unreadCount={unreadNotifCount} items={notifItems} />
              <UserMenu
                username={profile?.username ?? "you"}
                displayName={profile?.username ?? "You"}
                avatarUrl={profile?.avatar_url}
                isAdmin={isAdmin}
                onAddFilm={() => setAddFilmOpen(true)}
              />
            </>
          ) : (
            <Link href="/auth/signin" prefetch={false} className="btn btn-dark btn-sm" style={{ textDecoration: "none" }}>
              Sign In
            </Link>
          )}
        </div>
      </div>
    </div>
    {isAdmin && addFilmOpen && <AddFilmModal onClose={() => setAddFilmOpen(false)} />}
    </>
  );
}
