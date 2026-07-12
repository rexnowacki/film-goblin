import type { FeedItem } from "@/lib/queries/activity";
import ActivityRow from "./ActivityRow";
import ActivityWatchLoggedGroup from "./ActivityWatchLoggedGroup";
import ActivityHoardGroup from "./ActivityHoardGroup";
import SystemEventRow from "./SystemEventRow";
import { getPitTier } from "@/lib/feed-events/tier";

export default function FeedRow({ item }: { item: FeedItem }) {
  if (item.type === "system") {
    // No caller currently routes a system item through FeedRow (FeedTabs
    // renders SystemEventRow directly, with a cadence-resolved tier, and
    // FollowedActivityFeed — this component's other caller — never
    // produces system items at all). This branch exists only because
    // FeedItem's type includes "system"; fall back to the natural
    // (cadence-unaware) tier so it still typechecks and renders sanely
    // if that ever changes.
    return <SystemEventRow event={item.event} tier={getPitTier(item.event)} />;
  }
  if (item.type === "group") {
    if (item.group.kind === "watch_logged") {
      return <ActivityWatchLoggedGroup group={item.group} />;
    }
    return <ActivityHoardGroup group={item.group} />;
  }
  return <ActivityRow item={item.activity} />;
}
