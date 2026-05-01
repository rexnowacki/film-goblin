"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EnrichedActivity } from "@/lib/queries/activity";
import HeartButton from "../HeartButton";
import CommentButton from "../CommentButton";
import CommentSheet from "../CommentSheet";
import { relativeTime } from "./relativeTime";
import { createClient } from "@/lib/supabase/client";

interface Props {
  item: EnrichedActivity;
}

export default function ActivityFooter({ item }: Props) {
  const params = useSearchParams();
  const focusedId = params?.get("activity");
  const [count, setCount] = useState(item.comments.count);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);

  // Pull viewer once on mount. getSession() reads the cached session
  // synchronously (no network round-trip), so the composer never tries
  // to render with viewerId=null while we wait on a JWT validation call.
  useEffect(() => {
    const c = createClient();
    c.auth.getSession().then(({ data }) => setViewerId(data.session?.user?.id ?? null));
  }, []);

  // Auto-open the sheet when this row matches `?activity=<id>` on /home.
  useEffect(() => {
    if (focusedId && focusedId === item.id) setSheetOpen(true);
  }, [focusedId, item.id]);

  return (
    <>
      <div className="activity-footer">
        <span className="activity-footer-time" style={{ fontFamily: "var(--font-ui)", color: "var(--muted)" }}>{relativeTime(item.created_at)}</span>
        <CommentButton count={count} open={sheetOpen} onOpen={() => setSheetOpen(true)} />
        <HeartButton
          activityId={item.id}
          initialCount={item.reactions.count}
          initialLikedByMe={item.reactions.likedByMe}
        />
      </div>
      <CommentSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        activityId={item.id}
        actorUserId={item.actor.id}
        viewerId={viewerId}
        initialItems={item.comments.items}
        onCountChange={setCount}
      />
    </>
  );
}
