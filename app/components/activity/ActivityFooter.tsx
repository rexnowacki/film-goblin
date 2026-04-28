"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EnrichedActivity } from "@/lib/queries/activity";
import HeartButton from "../HeartButton";
import CommentButton from "../CommentButton";
import ActivityCommentThread from "../ActivityCommentThread";
import { relativeTime } from "./relativeTime";
import { createClient } from "@/lib/supabase/client";

interface Props {
  item: EnrichedActivity;
}

export default function ActivityFooter({ item }: Props) {
  const params = useSearchParams();
  const focusedId = params?.get("activity");
  const [count, setCount] = useState(item.comments.count);
  const [expanded, setExpanded] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);

  // Pull viewer once on mount. Avoids threading a prop through 7 kind components.
  useEffect(() => {
    const c = createClient();
    c.auth.getUser().then(({ data }) => setViewerId(data.user?.id ?? null));
  }, []);

  // Auto-expand when this row matches `?activity=<id>` on /home.
  useEffect(() => {
    if (focusedId && focusedId === item.id) setExpanded(true);
  }, [focusedId, item.id]);

  return (
    <>
      <div className="activity-footer">
        <span className="activity-footer-time" style={{ fontFamily: "var(--font-ui)", color: "var(--muted)" }}>{relativeTime(item.created_at)}</span>
        <CommentButton count={count} expanded={expanded} onToggle={() => setExpanded(v => !v)} />
        <HeartButton
          activityId={item.id}
          initialCount={item.reactions.count}
          initialLikedByMe={item.reactions.likedByMe}
        />
      </div>
      {expanded && (
        <ActivityCommentThread
          activityId={item.id}
          actorUserId={item.actor.id}
          viewerId={viewerId}
          initialItems={item.comments.items}
          onCountChange={setCount}
          onPosted={() => setExpanded(false)}
        />
      )}
    </>
  );
}
