"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  PULL_REFRESH_SLOP,
  PULL_REFRESH_THRESHOLD,
  getPullRefreshProgress,
  type PullRefreshProgress,
} from "@/lib/feed/pull-refresh";

interface Props {
  onRefresh: () => void;
  refreshing: boolean;
}

interface ActiveGesture {
  startX: number;
  startY: number;
}

const IDLE_PROGRESS: PullRefreshProgress = {
  phase: "idle",
  distance: 0,
  capture: false,
};

export default function FeedPullToRefresh({ onRefresh, refreshing }: Props) {
  const [progress, setProgress] = useState<PullRefreshProgress>(IDLE_PROGRESS);
  const gestureRef = useRef<ActiveGesture | null>(null);
  const progressRef = useRef<PullRefreshProgress>(IDLE_PROGRESS);
  const refreshingRef = useRef(refreshing);

  const resetGesture = useCallback(() => {
    gestureRef.current = null;
    progressRef.current = IDLE_PROGRESS;
    setProgress(IDLE_PROGRESS);
  }, []);

  useEffect(() => {
    refreshingRef.current = refreshing;
    if (refreshing) resetGesture();
  }, [refreshing, resetGesture]);

  useEffect(() => {
    const mobilePointer = window.matchMedia("(max-width: 720px) and (pointer: coarse)");

    function detachGestureListeners() {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    }

    function finishGesture() {
      detachGestureListeners();
      resetGesture();
    }

    function onTouchStart(event: TouchEvent) {
      finishGesture();
      const target = event.target;
      if (
        !mobilePointer.matches
        || refreshingRef.current
        || window.scrollY > 1
        || event.touches.length !== 1
        || (target instanceof Element && target.closest("a,button,input,textarea,select,[contenteditable]"))
      ) {
        return;
      }

      const touch = event.touches[0];
      gestureRef.current = { startX: touch.clientX, startY: touch.clientY };
      // Keep the scroll-blocking listener scoped to a possible pull from the
      // top. Ordinary feed scrolling never pays for a global non-passive move.
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onTouchEnd);
      window.addEventListener("touchcancel", onTouchCancel);
    }

    function onTouchMove(event: TouchEvent) {
      const gesture = gestureRef.current;
      if (!gesture) return;
      if (event.touches.length !== 1) {
        finishGesture();
        return;
      }

      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;

      // Once a gesture clearly belongs to a horizontal control or upward
      // scroll, release it permanently instead of claiming it on a reversal.
      if (
        (Math.abs(deltaX) > PULL_REFRESH_SLOP && Math.abs(deltaX) >= Math.abs(deltaY))
        || deltaY < -PULL_REFRESH_SLOP
      ) {
        finishGesture();
        return;
      }

      const next = getPullRefreshProgress({ deltaX, deltaY, startedAtTop: true });
      progressRef.current = next;
      setProgress(next);

      if (next.capture && event.cancelable) event.preventDefault();
    }

    function onTouchEnd() {
      const shouldRefresh = progressRef.current.phase === "armed" && !refreshingRef.current;
      finishGesture();
      if (shouldRefresh) onRefresh();
    }

    function onTouchCancel() {
      finishGesture();
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      detachGestureListeners();
    };
  }, [onRefresh, refreshing, resetGesture]);

  const indicatorPhase = refreshing ? "refreshing" : progress.phase;
  const indicatorDistance = refreshing ? PULL_REFRESH_THRESHOLD : progress.distance;
  const indicatorCopy = indicatorPhase === "refreshing"
    ? "Listening for new stirrings…"
    : indicatorPhase === "armed"
      ? "Release to refresh"
      : "Pull for new stirrings";
  const indicatorAnnouncement = indicatorPhase === "refreshing"
    ? "Refreshing feed"
    : indicatorPhase === "armed"
      ? "Release to refresh feed"
      : "Pull to refresh feed";
  const indicatorStyle = {
    "--feed-pull-distance": `${indicatorDistance}px`,
    "--feed-pull-turn": `${Math.min(indicatorDistance / PULL_REFRESH_THRESHOLD, 1) * 180}deg`,
  } as CSSProperties;
  const indicatorVisible = refreshing || progress.phase !== "idle";

  return (
    <>
      <div
        className={`feed-pull-refresh${indicatorVisible ? " is-visible" : ""}${refreshing ? " is-refreshing" : ""}`}
        style={indicatorStyle}
        data-phase={indicatorPhase}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-hidden={!indicatorVisible}
        aria-label={indicatorAnnouncement}
      >
        <span className="feed-pull-refresh__sigil" aria-hidden="true">↻</span>
        <span>{indicatorCopy}</span>
      </div>
      <button
        type="button"
        className="feed-stream__live"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh feed"
      >
        <i aria-hidden="true" />
        {refreshing ? "Refreshing" : "Live"}
      </button>
    </>
  );
}
