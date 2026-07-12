import { getServerUser } from "@/lib/supabase/cached";
import BottomNavClient from "./BottomNavClient";

interface Props {
  current?: string; // shares the existing 6-id space used by TopNav
}

const HOARD_IDS = new Set(["watchlist", "library", "watched"]);

function activeTab(current: string | undefined): "feed" | "discovery" | "coven" | "hoard" | null {
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
  return <BottomNavClient active={active} />;
}
