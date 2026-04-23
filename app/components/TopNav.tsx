import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Avatar from "./Avatar";
import UserMenu from "./UserMenu";

interface TopNavProps {
  current?: string;
}

export default async function TopNav({ current }: TopNavProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile: { handle: string; display_name: string | null; avatar_url: string | null } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("handle, display_name, avatar_url")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const items = user
    ? [
        { id: "home", label: "Home", href: "/home" },
        { id: "films", label: "Films", href: "/films" },
        { id: "lists", label: "Lists", href: "/lists" },
        { id: "settings", label: "Settings", href: "/settings" },
      ]
    : [
        { id: "films", label: "Films", href: "/films" },
        { id: "lists", label: "Lists", href: "/lists" },
      ];

  return (
    <div style={{ borderBottom: "1px solid #2a2a2a", background: "var(--void-2)", position: "sticky", top: 0, zIndex: 20 }}>
      <div className="container-wide" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Link href={user ? "/home" : "/"} style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1, color: "var(--bone)", textDecoration: "none" }}>
            Film<span style={{ color: "var(--accent)" }}>Goblin</span>
          </Link>
          <nav style={{ display: "flex", gap: 22 }}>
            {items.map(it => (
              <Link key={it.id} href={it.href} className="caps" style={{
                fontSize: 11,
                color: current === it.id ? "var(--accent)" : "var(--bone)",
                borderBottom: current === it.id ? "2px solid var(--accent)" : "2px solid transparent",
                paddingBottom: 4,
                textDecoration: "none",
              }}>{it.label}</Link>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {user ? (
            <UserMenu
              handle={profile?.handle ?? "you"}
              displayName={profile?.display_name ?? profile?.handle ?? "You"}
              avatarUrl={profile?.avatar_url}
            />
          ) : (
            <Link href="/auth/signin" className="btn btn-dark btn-sm" style={{ textDecoration: "none" }}>
              Sign In
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
