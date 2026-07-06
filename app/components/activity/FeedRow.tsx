import type { FeedItem } from "@/lib/queries/activity";
import ActivityRow from "./ActivityRow";
import ActivityWatchlistAddedGroup from "./ActivityWatchlistAddedGroup";
import ActivityWatchLoggedGroup from "./ActivityWatchLoggedGroup";
import SystemEventRow from "./SystemEventRow";

export default function FeedRow({ item }: { item: FeedItem }) {
  if (item.type === "system") {
    return <SystemEventRow event={item.event} />;
  }
  if (item.type === "group") {
    if (item.group.kind === "watch_logged") {
      return <ActivityWatchLoggedGroup group={item.group} />;
    }
    return <ActivityWatchlistAddedGroup group={item.group} />;
  }
  return <ActivityRow item={item.activity} />;
}
