import type { EnrichedActivity } from "@/lib/queries/activity";
import HeartButton from "../HeartButton";
import { relativeTime } from "./relativeTime";

interface Props {
  item: EnrichedActivity;
}

export default function ActivityFooter({ item }: Props) {
  return (
    <div className="activity-footer">
      <span className="caps activity-footer-time">{relativeTime(item.created_at)}</span>
      <HeartButton
        activityId={item.id}
        initialCount={item.reactions.count}
        initialLikedByMe={item.reactions.likedByMe}
        isOwnRow={item.isOwnRow}
      />
    </div>
  );
}
