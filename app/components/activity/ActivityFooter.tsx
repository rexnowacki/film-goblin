"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EnrichedActivity } from "@/lib/queries/activity";
import HeartButton from "../HeartButton";
import CommentButton from "../CommentButton";
import CommentSheet from "../modals/CommentSheet";
import { relativeTime } from "./relativeTime";
import { createClient } from "@/lib/supabase/client";

interface Props {
  item: EnrichedActivity;
}

interface ViewerProfile {
  id: string;
  avatar_url: string | null;
  display_name: string | null;
}

export default function ActivityFooter({ item }: Props) {
  const params = useSearchParams();
  const focusedId = params?.get("activity");
  const [count, setCount] = useState(item.comments.count);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewer, setViewer] = useState<ViewerProfile | null>(null);

  useEffect(() => {
    const c = createClient();
    c.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user?.id ?? null;
      if (!uid) {
        setViewer(null);
        return;
      }
      const { data: prof } = await c
        .from("profiles")
        .select("id, avatar_url, display_name")
        .eq("id", uid)
        .single();
      setViewer(prof ?? { id: uid, avatar_url: null, display_name: null });
    });
  }, []);

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
        viewerId={viewer?.id ?? null}
        viewerAvatarUrl={viewer?.avatar_url ?? null}
        viewerDisplayName={viewer?.display_name ?? null}
        initialItems={item.comments.items}
        onCountChange={setCount}
      />
    </>
  );
}
