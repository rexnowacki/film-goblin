import React from "react";

interface Props {
  pct: number | null;
  count: number;
  threshold?: number;
}

interface Tier {
  label: string;
  color: string;
}

function tier(pct: number): Tier {
  if (pct >= 90) return { label: "Anointed", color: "var(--accent)" };
  if (pct >= 60) return { label: "Coven approved", color: "var(--accent)" };
  if (pct >= 40) return { label: "Coven divided", color: "var(--bone)" };
  return { label: "Cursed", color: "var(--danger)" };
}

export default function CovenScore({ pct, count, threshold = 5 }: Props) {
  if (pct === null) {
    return (
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 14,
          color: "var(--muted)",
        }}
      >
        Awaiting verdict — {count} of {threshold} ratings
      </div>
    );
  }

  const t = tier(pct);
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
      <span
        className="caps"
        style={{
          fontSize: 11,
          color: t.color,
          fontWeight: 700,
        }}
      >
        {t.label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 32,
          lineHeight: 1,
          color: t.color,
        }}
      >
        {pct}%
      </span>
      <span
        className="caps"
        style={{ fontSize: 10, color: "var(--muted)" }}
      >
        coven approval · {count} ratings
      </span>
    </div>
  );
}
