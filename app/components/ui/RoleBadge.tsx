import React from "react";

export type Role = "goblin" | "witch" | "high_goblin";

interface Props {
  role: Role | null | undefined;
  size?: number;
  title?: string;
}

export default function RoleBadge({ role, size = 20, title }: Props) {
  if (!role || role === "goblin") return null;
  if (role === "witch") {
    return (
      <span
        title={title ?? "Witch"}
        aria-label={title ?? "Witch"}
        style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle", color: "var(--accent)" }}
      >
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="32" cy="32" r="22" />
          <path d="M 32 10 L 44.9 49.8 L 11.1 25.2 L 52.9 25.2 L 19.1 49.8 Z" />
        </svg>
      </span>
    );
  }
  // high_goblin: simple goblin-head silhouette (pointy ears + horns).
  return (
    <span
      title={title ?? "High Goblin"}
      aria-label={title ?? "High Goblin"}
      style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="var(--accent)" />
        <path
          d="M7 10 L5 6 L8.5 9 L12 7 L15.5 9 L19 6 L17 10 Q17 15 12 17 Q7 15 7 10 Z"
          fill="var(--void)"
          stroke="var(--void)"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
        <circle cx="9.5" cy="11.5" r="0.9" fill="var(--accent)" />
        <circle cx="14.5" cy="11.5" r="0.9" fill="var(--accent)" />
      </svg>
    </span>
  );
}
