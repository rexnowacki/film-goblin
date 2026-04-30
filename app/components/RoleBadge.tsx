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
        style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="var(--accent-deep)" />
          <path
            d="M12 4 L14.35 11.24 L21.93 11.24 L15.79 15.71 L18.14 22.94 L12 18.47 L5.86 22.94 L8.21 15.71 L2.07 11.24 L9.65 11.24 Z"
            fill="none"
            stroke="var(--bone)"
            strokeWidth="1.4"
            strokeLinejoin="miter"
            transform="translate(0,0.5) scale(0.7) translate(5.14, 5.14)"
          />
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
