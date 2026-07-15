import { describe, expect, it } from "vitest";
import {
  PULL_REFRESH_THRESHOLD,
  getPullRefreshProgress,
} from "@/lib/feed/pull-refresh";

describe("feed pull-to-refresh gesture", () => {
  it("ignores gestures that did not begin at the top of the page", () => {
    expect(getPullRefreshProgress({ deltaX: 0, deltaY: 160, startedAtTop: false })).toEqual({
      phase: "idle",
      distance: 0,
      capture: false,
    });
  });

  it("leaves horizontal swipes to feed controls", () => {
    expect(getPullRefreshProgress({ deltaX: 80, deltaY: 30, startedAtTop: true })).toEqual({
      phase: "idle",
      distance: 0,
      capture: false,
    });
  });

  it("tracks a vertically dominant downward pull with resistance", () => {
    const progress = getPullRefreshProgress({ deltaX: 8, deltaY: 80, startedAtTop: true });

    expect(progress.capture).toBe(true);
    expect(progress.phase).toBe("pulling");
    expect(progress.distance).toBeGreaterThan(0);
    expect(progress.distance).toBeLessThan(80);
  });

  it("arms only after the resisted pull reaches the refresh threshold", () => {
    const progress = getPullRefreshProgress({ deltaX: 0, deltaY: 180, startedAtTop: true });

    expect(progress.capture).toBe(true);
    expect(progress.distance).toBeGreaterThanOrEqual(PULL_REFRESH_THRESHOLD);
    expect(progress.phase).toBe("armed");
  });

  it("arms at the exact resisted threshold boundary", () => {
    expect(getPullRefreshProgress({ deltaX: 0, deltaY: 93, startedAtTop: true })).toEqual({
      phase: "armed",
      distance: PULL_REFRESH_THRESHOLD,
      capture: true,
    });
    expect(getPullRefreshProgress({ deltaX: 0, deltaY: 92, startedAtTop: true }).phase).toBe("pulling");
  });

  it("clamps visual travel during a long pull", () => {
    const longPull = getPullRefreshProgress({ deltaX: 0, deltaY: 1_000, startedAtTop: true });
    const longerPull = getPullRefreshProgress({ deltaX: 0, deltaY: 2_000, startedAtTop: true });

    expect(longPull.distance).toBe(longerPull.distance);
  });

  it("ignores upward motion and tiny touch jitter", () => {
    expect(getPullRefreshProgress({ deltaX: 0, deltaY: -30, startedAtTop: true }).phase).toBe("idle");
    expect(getPullRefreshProgress({ deltaX: 1, deltaY: 5, startedAtTop: true }).phase).toBe("idle");
  });
});
