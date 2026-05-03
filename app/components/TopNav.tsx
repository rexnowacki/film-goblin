import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getPendingInviteCount } from "@/lib/queries/coven";
import { getUnreadNotificationCount, getRecentNotifications } from "@/lib/queries/notifications";
import TopNavChrome from "./TopNavChrome";

interface TopNavProps {
  current?: string;
}

export default async function TopNav({ current }: TopNavProps) {
  const user = await getServerUser();
  const supabase = await createClient();

  let profile: { username: string; display_name: string | null; avatar_url: string | null } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("username, display_name, avatar_url")
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
  let unreadNotifCount = 0;
  let notifItems: Awaited<ReturnType<typeof getRecentNotifications>> = [];
  if (user) {
    [pendingInviteCount, unreadNotifCount, notifItems] = await Promise.all([
      getPendingInviteCount(supabase, user.id),
      getUnreadNotificationCount(supabase, user.id),
      getRecentNotifications(supabase, user.id),
    ]);
  }

  const items = user
    ? [
        { id: "home", label: "Home", href: "/home" },
        { id: "for-you", label: "For You", href: "/for-you" },
        { id: "films", label: "Discovery", href: "/films" },
        { id: "watchlist", label: "Watchlist", href: "/watchlist" },
        { id: "library", label: "Your Grimoire", href: "/library" },
        { id: "watched", label: "Diary", href: "/watched" },
        { id: "coven", label: "Covenfolk", href: "/coven", badge: pendingInviteCount },
      ]
    : [
        { id: "films", label: "Discovery", href: "/films" },
      ];

  return (
    <TopNavChrome
      items={items}
      current={current}
      user={Boolean(user)}
      profile={profile}
      isAdmin={isAdmin}
      unreadNotifCount={unreadNotifCount}
      notifItems={notifItems}
    />
  );
}
