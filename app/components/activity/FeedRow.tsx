import type { FeedItem } from "@/lib/queries/activity";
import ActivityRow from "./ActivityRow";
import ActivityWatchlistAddedGroup from "./ActivityWatchlistAddedGroup";
import ActivityWatchLoggedGroup from "./ActivityWatchLoggedGroup";

export default function FeedRow({ item }: { item: FeedItem }) {
  if (item.type === "group") {
    if (item.group.kind === "watch_logged") {
      return <ActivityWatchLoggedGroup group={item.group} />;
    }
    return <ActivityWatchlistAddedGroup group={item.group} />;
  }
  return <ActivityRow item={item.activity} />;
}
