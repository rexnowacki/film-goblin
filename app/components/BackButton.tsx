"use client";

import { useRouter } from "next/navigation";

export default function BackButton({ fallback = "/films" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      style={{
        background: "transparent",
        border: "none",
        padding: "4px 8px 4px 0",
        color: "var(--muted)",
        fontSize: 20,
        lineHeight: 1,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      ‹
    </button>
  );
}
