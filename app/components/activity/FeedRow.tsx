import type { FeedItem } from "@/lib/queries/activity";
import ActivityRow from "./ActivityRow";
import ActivityWatchlistAddedGroup from "./ActivityWatchlistAddedGroup";

export default function FeedRow({ item }: { item: FeedItem }) {
  if (item.type === "group") {
    return <ActivityWatchlistAddedGroup group={item.group} />;
  }
  return <ActivityRow item={item.activity} />;
}
