"use client";

import { useCallback, useState, useTransition } from "react";
import { toggleCommentReaction, fetchLikersForComment } from "@/lib/actions/comment-reactions";
import { compactCount } from "@/lib/format";
import HeartIcon from "./HeartIcon";
import LikersBottomSheet from "./LikersBottomSheet";

interface Props {
  commentId: string;
  initialCount: number;
  initialLikedByMe: boolean;
  disabled?: boolean;
}

export default function CommentHeartButton({
  commentId,
  initialCount,
  initialLikedByMe,
  disabled = false,
}: Props) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLikedByMe);
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const fetcher = useCallback(() => fetchLikersForComment(commentId), [commentId]);

  function onTap() {
    if (disabled || pending) return;
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!prevLiked);
    setCount(prevCount + (prevLiked ? -1 : 1));
    startTransition(async () => {
      try {
        await toggleCommentReaction(commentId);
      } catch (e) {
        setLiked(prevLiked);
        setCount(prevCount);
        console.error(e);
      }
    });
  }

  return (
    <div className="comment-heart-stack">
      <button
        type="button"
        onClick={onTap}
        disabled={disabled || pending}
        className={`heart-btn ${liked ? "heart-liked" : ""}`}
        aria-label={liked ? "Unlike comment" : "Like comment"}
        aria-pressed={liked}
      >
        <HeartIcon filled={liked} />
      </button>
      {count > 0 ? (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="comment-heart-count comment-heart-count-button"
          aria-label={`See who liked this comment (${count})`}
        >
          {compactCount(count)}
        </button>
      ) : (
        <span className="comment-heart-count">{compactCount(count)}</span>
      )}
      <LikersBottomSheet
        cacheKey={`comment:${commentId}`}
        fetcher={fetcher}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
