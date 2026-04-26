import { createClient } from "@/lib/supabase/server";
import { getPendingInviteCount } from "@/lib/queries/coven";
import TopNavChrome from "./TopNavChrome";

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

  let isAdmin = false;
  if (user) {
    const { data: staffRow } = await supabase
      .from("staff")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    isAdmin = staffRow?.role === "admin";
  }

  let pendingInviteCount = 0;
  if (user) {
    pendingInviteCount = await getPendingInviteCount(supabase, user.id);
  }

  const items = user
    ? [
        { id: "home", label: "Home", href: "/home" },
        { id: "films", label: "Films", href: "/films" },
        { id: "watchlist", label: "Watchlist", href: "/watchlist" },
        { id: "library", label: "Library", href: "/library" },
        { id: "watched", label: "Diary", href: "/watched" },
        { id: "lists", label: "Lists", href: "/lists" },
        { id: "people", label: "People", href: "/people" },
        { id: "coven", label: "Coven", href: "/coven", badge: pendingInviteCount },
        { id: "settings", label: "Settings", href: "/settings" },
      ]
    : [
        { id: "films", label: "Films", href: "/films" },
        { id: "lists", label: "Lists", href: "/lists" },
      ];

  return (
    <TopNavChrome
      items={items}
      current={current}
      user={Boolean(user)}
      profile={profile}
      isAdmin={isAdmin}
    />
  );
}
