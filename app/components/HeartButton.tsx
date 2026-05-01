"use client";

import { useState, useTransition } from "react";
import { toggleReaction } from "@/lib/actions/reactions";
import { compactCount } from "@/lib/format";
import LikersBottomSheet from "./LikersBottomSheet";

interface Props {
  activityId: string;
  initialCount: number;
  initialLikedByMe: boolean;
}

function HeartIcon({ filled }: { filled: boolean }) {
  // Sharp-geometry classic heart. Miter linejoin keeps the lobes pointed
  // (not rounded) — matches the spec's "no chubby, bubbly edges" rule.
  return (
    <svg viewBox="0 0 18 16" width="16" height="14" aria-hidden="true">
      <path
        d="M9 15 L1 7 A4 4 0 0 1 9 3 A4 4 0 0 1 17 7 Z"
        fill={filled ? "var(--accent)" : "none"}
        stroke={filled ? "var(--accent)" : "var(--muted)"}
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
    </svg>
  );
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
        activityId={activityId}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
