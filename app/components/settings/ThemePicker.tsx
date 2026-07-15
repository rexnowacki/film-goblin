"use client";

import { useTransition } from "react";
import { setTheme } from "@/lib/actions/theme";
import type { Theme } from "@/lib/theme";
import SettingsSection from "@/components/settings/SettingsSection";

interface Swatch {
  paper: string;
  ink: string;
  accent: string;
  label: string;
  subline: string;
}

const SWATCHES: Record<Theme, Swatch> = {
  "pink-goblin": {
    paper: "#F3ECD8",
    ink: "#0A0A0A",
    accent: "#FF2D88",
    label: "Pink Goblin",
    subline: "Cream, void, hot pink. The default.",
  },
  "goblin-print": {
    paper: "#F9EAD5",
    ink: "#050404",
    accent: "#FB3B84",
    label: "Goblin Print",
    subline: "Cream paper, black ink, hot pink. Rough off the press.",
  },
};

export default function ThemePicker({ current }: { current: Theme }) {
  const [pending, start] = useTransition();

  function pick(theme: Theme) {
    if (theme === current || pending) return;
    start(async () => {
      await setTheme(theme);
    });
  }

  const entries = Object.entries(SWATCHES) as [Theme, Swatch][];

  return (
    <SettingsSection id="appearance" eyebrow="Taste and appearance" title="Theme">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {entries.map(([key, sw]) => {
          const active = key === current;
          return (
            <button
              key={key}
              type="button"
              onClick={() => pick(key)}
              disabled={pending}
              aria-pressed={active}
              style={{
                position: "relative",
                display: "block",
                textAlign: "left",
                padding: 16,
                border: `2px solid ${active ? "var(--accent)" : "var(--bone)"}`,
                background: "transparent",
                color: "inherit",
                cursor: pending ? "wait" : "pointer",
                opacity: pending && !active ? 0.5 : 1,
              }}
            >
              <div style={{ display: "flex", gap: 4, marginBottom: 12, height: 36 }}>
                <div style={{ flex: 1, background: sw.paper, border: "1px solid var(--bone)" }} aria-hidden="true" />
                <div style={{ flex: 1, background: sw.ink, border: "1px solid var(--bone)" }} aria-hidden="true" />
                <div style={{ flex: 1, background: sw.accent, border: "1px solid var(--bone)" }} aria-hidden="true" />
              </div>
              <div className="head" style={{ fontSize: 22, marginBottom: 4 }}>{sw.label}</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, opacity: 0.75 }}>{sw.subline}</div>
              {active && (
                <span className="caps" style={{ position: "absolute", top: 10, right: 10, padding: "3px 6px", border: "1px solid var(--bone)", background: "var(--accent)", color: "var(--accent-ink)", fontSize: 9, fontWeight: 700 }}>
                  ✓ Active
                </span>
              )}
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}
