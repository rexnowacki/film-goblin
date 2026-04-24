"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import UserMenu from "./UserMenu";

interface NavItem { id: string; label: string; href: string; badge?: number }
interface ProfileShape { handle: string; display_name: string | null; avatar_url: string | null }

interface Props {
  items: NavItem[];
  current?: string;
  user: boolean;
  profile: ProfileShape | null;
  isAdmin: boolean;
}

export default function TopNavChrome({ items, current, user, profile, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer when the route changes.
  useEffect(() => { setOpen(false); }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div style={{ borderBottom: "1px solid #2a2a2a", background: "var(--void-2)", position: "sticky", top: 0, zIndex: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", maxWidth: 1280, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28, minWidth: 0 }}>
          <Link href={user ? "/home" : "/"} style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1, color: "var(--bone)", textDecoration: "none", flexShrink: 0 }}>
            Film<span style={{ color: "var(--accent)" }}>Goblin</span>
          </Link>
          <nav className="desktop-only" style={{ display: "flex", gap: 22 }}>
            {items.map(it => (
              <Link key={it.id} href={it.href} className="caps" style={{
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
            <UserMenu
              handle={profile?.handle ?? "you"}
              displayName={profile?.display_name ?? profile?.handle ?? "You"}
              avatarUrl={profile?.avatar_url}
              isAdmin={isAdmin}
            />
          ) : (
            <Link href="/auth/signin" className="btn btn-dark btn-sm" style={{ textDecoration: "none" }}>
              Sign In
            </Link>
          )}
          <button
            className="mobile-only"
            onClick={() => setOpen(v => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            style={{
              background: "transparent", border: 0, padding: 6, cursor: "pointer",
              color: "var(--bone)",
            }}
          >
            <HamburgerIcon open={open} />
          </button>
        </div>
      </div>

      {open && (
        <div
          className="mobile-only"
          style={{
            borderTop: "1px solid #2a2a2a",
            background: "var(--void-2)",
            padding: "8px 20px 16px",
          }}
        >
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {items.map(it => (
              <Link
                key={it.id}
                href={it.href}
                className="caps"
                onClick={() => setOpen(false)}
                style={{
                  padding: "14px 6px",
                  fontSize: 14,
                  color: current === it.id ? "var(--accent)" : "var(--bone)",
                  textDecoration: "none",
                  borderBottom: "1px solid #2a2a2a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>{it.label}</span>
                {it.badge && it.badge > 0 ? (
                  <span style={{ padding: "1px 8px", background: "var(--accent)", color: "var(--accent-ink)", fontSize: 10, fontWeight: 700, borderRadius: 999 }}>
                    {it.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  const bar = { width: 22, height: 2, background: "currentColor", transition: "transform 0.15s, opacity 0.15s" };
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 5, padding: 4 }}>
      <span style={{ ...bar, transform: open ? "translateY(7px) rotate(45deg)" : "none" }} />
      <span style={{ ...bar, opacity: open ? 0 : 1 }} />
      <span style={{ ...bar, transform: open ? "translateY(-7px) rotate(-45deg)" : "none" }} />
    </span>
  );
}
