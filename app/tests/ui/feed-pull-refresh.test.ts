import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("home feed pull-to-refresh wiring", () => {
  const component = readFileSync("components/FeedPullToRefresh.tsx", "utf8");
  const tabs = readFileSync("components/FeedTabs.tsx", "utf8");
  const archive = readFileSync("components/PitArchiveTab.tsx", "utf8");
  const css = readFileSync("app/styles/320-home-feed.css", "utf8");

  it("refreshes through the Next router while preserving URL state", () => {
    expect(tabs).toContain("router.refresh()");
    expect(tabs).not.toContain("location.reload");
    expect(tabs).toContain("<FeedPullToRefresh");
    expect(tabs).toContain("onRefresh={requestRefresh}");
    expect(tabs).toContain("refreshing={refreshing}");
  });

  it("uses a non-passive vertical touch lock and releases every global listener", () => {
    expect(component).toContain('addEventListener("touchmove", onTouchMove, { passive: false })');
    expect(component).toContain("event.preventDefault()");
    expect(component).toContain('removeEventListener("touchmove", onTouchMove)');
    expect(component).toContain('addEventListener("touchcancel", onTouchCancel)');
    expect(component).toContain('removeEventListener("touchcancel", onTouchCancel)');
    expect(component).toContain('closest("a,button,input,textarea,select,[contenteditable]")');
  });

  it("keeps the gesture mobile-only, safe-area aware, and reduced-motion safe", () => {
    expect(component).toContain('(max-width: 720px) and (pointer: coarse)');
    expect(component).toContain("window.scrollY > 1");
    expect(css).toContain("env(safe-area-inset-top)");
    expect(css).toContain("@media (max-width:720px)");
    expect(css).toContain("@media (prefers-reduced-motion:reduce)");
    expect(css).toContain("pointer-events:none");
  });

  it("provides a keyboard-accessible refresh alternative", () => {
    expect(component).toContain('aria-label="Refresh feed"');
    expect(component).toContain('type="button"');
    expect(css).toContain("clip-path:inset(50%)");
    expect(css).not.toContain(".feed-pull-refresh { display:none");
  });

  it("invalidates in-flight pagination before a refresh can replace its first page", () => {
    expect(tabs).toContain("scopeVersionRef.current += 1");
    expect(tabs).toContain("scopeVersion !== scopeVersionRef.current");
    expect(archive).toContain("scopeVersionRef.current += 1");
    expect(archive).toContain("scopeVersion !== scopeVersionRef.current");
  });
});
