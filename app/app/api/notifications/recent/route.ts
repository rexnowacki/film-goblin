import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRecentNotifications, getUnreadNotificationCount } from "@/lib/queries/notifications";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ unreadCount: 0, items: [] }, { status: 401 });

  const [unreadCount, items] = await Promise.all([
    getUnreadNotificationCount(supabase, user.id),
    getRecentNotifications(supabase, user.id),
  ]);

  return NextResponse.json({ unreadCount, items });
}
