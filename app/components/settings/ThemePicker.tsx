"use client";

import { useTransition } from "react";
import { setTheme } from "@/lib/actions/theme";
import type { Theme } from "@/lib/theme";

interface Swatch {
  bone: string;
  void: string;
  accent: string;
  label: string;
  subline: string;
}

const SWATCHES: Record<Theme, Swatch> = {
  "pink-goblin": {
    bone: "#f3ecd8",
    void: "#0a0a0a",
    accent: "#ff2d88",
    label: "Pink Goblin",
    subline: "Cream zine, void black, hot pink. The default.",
  },
  midsommar: {
    bone: "#f5efde",
    void: "#2a1f12",
    accent: "#e8c547",
    label: "Midsommar",
    subline: "Linen, pine, buttercup. Hårga at noon.",
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
    <section style={{ marginTop: 28, marginBottom: 28 }}>
      <h2 className="head" style={{ fontSize: 24, marginBottom: 14 }}>Theme</h2>
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
                <div style={{ flex: 1, background: sw.bone, border: "1px solid var(--bone)" }} aria-hidden="true" />
                <div style={{ flex: 1, background: sw.void, border: "1px solid var(--bone)" }} aria-hidden="true" />
                <div style={{ flex: 1, background: sw.accent, border: "1px solid var(--bone)" }} aria-hidden="true" />
              </div>
              <div className="head" style={{ fontSize: 22, marginBottom: 4 }}>{sw.label}</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, opacity: 0.75 }}>{sw.subline}</div>
              {active && (
                <span className="caps" style={{ position: "absolute", top: 12, right: 12, fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>
                  ✓ Active
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
