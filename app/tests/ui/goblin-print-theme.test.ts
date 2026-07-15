import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_LABELS,
  isTheme,
  readTheme,
} from "../../lib/theme";

const picker = readFileSync("components/settings/ThemePicker.tsx", "utf8");
const core = readFileSync("app/styles/00-core.css", "utf8");
const themeCss = readFileSync("app/styles/340-goblin-print.css", "utf8");
const globals = readFileSync("app/globals.css", "utf8");
const pitCss = readFileSync("app/styles/230-pit-tiers.css", "utf8");
const landingFeed = readFileSync("components/LandingFeedCard.tsx", "utf8");
const semanticConsumers = [
  "components/WatchModal.tsx",
  "components/activity/ActivityWatchLogged.tsx",
  "components/LeaveCovenButton.tsx",
  "app/settings/DeleteAccountSection.tsx",
  "app/admin/announcements/ArchiveButton.tsx",
  "app/admin/users/DeleteUserModal.tsx",
  "app/admin/films/RetireModal.tsx",
].map((path) => readFileSync(path, "utf8")).join("\n");

function hexToLuminance(hex: string) {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string) {
  const [lighter, darker] = [hexToLuminance(a), hexToLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function themeHex(token: string) {
  const match = themeCss.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`));
  expect(match, `${token} should be a six-digit hex token`).not.toBeNull();
  return match![1];
}

describe("Goblin Print theme", () => {
  it("replaces Midsommar while migrating its existing cookie value", () => {
    expect(THEMES).toEqual(["pink-goblin", "goblin-print"]);
    expect(DEFAULT_THEME).toBe("pink-goblin");
    expect(isTheme("goblin-print")).toBe(true);
    expect(isTheme("midsommar")).toBe(false);
    expect(readTheme("midsommar")).toBe("goblin-print");
    expect(readTheme("unknown-theme")).toBe(DEFAULT_THEME);
    expect(THEME_LABELS["goblin-print"]).toBe("Goblin Print");
  });

  it("exposes the new paper, ink, and screen-print treatment in the picker", () => {
    expect(picker).toContain('"goblin-print": {');
    expect(picker).toContain('label: "Goblin Print"');
    expect(picker).toContain('paper: "#F9EAD5"');
    expect(picker).toContain('ink: "#050404"');
    expect(picker).toContain('accent: "#FB3B84"');
    expect(picker).not.toContain('label: "Midsommar"');
  });

  it("loads one isolated theme override without changing the fixed Pit palette", () => {
    expect(globals).toContain('@import "./styles/340-goblin-print.css";');
    expect(themeCss).toContain('[data-theme="goblin-print"]');
    expect(themeCss).toContain("--print-pink: #FB3B84");
    expect(themeCss).toContain("screen-print paper grain");
    expect(themeCss).not.toContain('[data-theme="midsommar"]');
    expect(themeCss).not.toMatch(/--pit-[\w-]+\s*:/);
    expect(core).not.toContain('[data-theme="midsommar"]');
  });

  it("keeps every Pit tier on its fixed dark identity, including the landing feed", () => {
    expect(pitCss).toContain("var(--pit-plum-bg)");
    expect(pitCss).toContain(".pit-copy-link");
    expect(landingFeed).toContain('className="pit-copy"');
    expect(landingFeed).toContain('color: "var(--pit-cream-dim)"');
    expect(landingFeed).toContain("<Thumb film={row.event.film} pit />");
  });

  it("uses semantic ink roles for filled highlight and danger controls", () => {
    expect(semanticConsumers).toContain("var(--highlight-ink)");
    expect(semanticConsumers).toContain("var(--danger-ink)");
    expect(semanticConsumers).not.toMatch(
      /background:\s*"var\(--danger\)"[^}\n]*color:\s*"var\(--bone\)"/,
    );
  });

  it("keeps legacy inverse cards as readable literal paper surfaces", () => {
    expect(themeCss).toContain(".grain-light:not(.signin-card):not(.landing-rites-band)");
    expect(themeCss).toContain(".theme-paper-panel");
    expect(themeCss).toContain(".user-menu-panel");
    expect(themeCss).toContain('.auth-paper-canvas .btn-dark');
  });

  it("keeps text-bearing theme roles at AA contrast", () => {
    const papers = [themeHex("--void"), themeHex("--void-2"), themeHex("--void-3")];
    const ink = themeHex("--bone");
    const accent = themeHex("--accent");
    const accentInk = themeHex("--accent-ink");
    const accentDeep = themeHex("--accent-deep");
    const accentDeepInk = themeHex("--accent-deep-ink");
    const muted = themeHex("--muted");
    const highlight = themeHex("--highlight");
    const highlightInk = themeHex("--highlight-ink");
    const danger = themeHex("--danger");
    const dangerInk = themeHex("--danger-ink");

    for (const paper of papers) {
      expect(contrast(ink, paper)).toBeGreaterThanOrEqual(7);
      expect(contrast(accent, paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted, paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(danger, paper)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(accentInk, accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accentDeepInk, accentDeep)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(highlightInk, highlight)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dangerInk, danger)).toBeGreaterThanOrEqual(4.5);
  });
});
