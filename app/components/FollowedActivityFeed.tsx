import FeedRow from "@/components/activity/FeedRow";
import { groupFeed } from "@/lib/queries/group-activity";
import type { EnrichedActivity } from "@/lib/queries/activity";

export default function FollowedActivityFeed({ items }: { items: EnrichedActivity[] }) {
  const grouped = groupFeed(items);
  return (
    <div style={{ display: "grid", gap: 0 }}>
      {grouped.map(item => (
        <FeedRow
          key={item.type === "group" ? item.group.key : item.activity.id}
          item={item}
        />
      ))}
    </div>
  );
}
