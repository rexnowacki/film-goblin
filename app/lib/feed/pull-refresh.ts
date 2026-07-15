export const PULL_REFRESH_THRESHOLD = 64;
export const PULL_REFRESH_SLOP = 8;

const PULL_REFRESH_RESISTANCE = 0.75;
const PULL_REFRESH_MAX_DISTANCE = 88;

export type PullRefreshPhase = "idle" | "pulling" | "armed";

export interface PullRefreshProgress {
  phase: PullRefreshPhase;
  distance: number;
  capture: boolean;
}

interface PullRefreshInput {
  deltaX: number;
  deltaY: number;
  startedAtTop: boolean;
}

const IDLE_PROGRESS: PullRefreshProgress = {
  phase: "idle",
  distance: 0,
  capture: false,
};

/**
 * Converts a raw touch delta into the resisted travel shown by the feed's
 * pull-to-refresh indicator. Direction ownership stays explicit here so the
 * page never steals horizontal carousels, upward scrolling, or touch jitter.
 */
export function getPullRefreshProgress({
  deltaX,
  deltaY,
  startedAtTop,
}: PullRefreshInput): PullRefreshProgress {
  if (!startedAtTop || deltaY <= PULL_REFRESH_SLOP || Math.abs(deltaX) >= deltaY) {
    return IDLE_PROGRESS;
  }

  const distance = Math.min(
    PULL_REFRESH_MAX_DISTANCE,
    Math.round((deltaY - PULL_REFRESH_SLOP) * PULL_REFRESH_RESISTANCE),
  );

  return {
    phase: distance >= PULL_REFRESH_THRESHOLD ? "armed" : "pulling",
    distance,
    capture: true,
  };
}
