"use client";

import { useCallback, useState, useTransition } from "react";
import { toggleReaction, fetchLikersForActivity } from "@/lib/actions/reactions";
import { compactCount } from "@/lib/format";
import LikersBottomSheet from "./LikersBottomSheet";
import HeartIcon from "./HeartIcon";

interface Props {
  activityId: string;
  initialCount: number;
  initialLikedByMe: boolean;
}

export default function HeartButton({
  activityId,
  initialCount,
  initialLikedByMe,
}: Props) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLikedByMe);
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const fetcher = useCallback(() => fetchLikersForActivity(activityId), [activityId]);

  function onHeartTap() {
    // Optimistic update: flip local state immediately; rollback on server error.
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!prevLiked);
    setCount(prevCount + (prevLiked ? -1 : 1));
    startTransition(async () => {
      try {
        await toggleReaction(activityId);
      } catch (e) {
        setLiked(prevLiked);
        setCount(prevCount);
        console.error(e);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onHeartTap}
        disabled={pending}
        className={`heart-btn ${liked ? "heart-liked" : ""}`}
        aria-label={liked ? "Unlike" : "Like"}
        aria-pressed={liked}
      >
        <HeartIcon filled={liked} />
      </button>
      {count > 0 && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="heart-count"
          aria-label={`See who liked this (${count})`}
        >
          {compactCount(count)}
        </button>
      )}
      <LikersBottomSheet
        cacheKey={`activity:${activityId}`}
        fetcher={fetcher}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
