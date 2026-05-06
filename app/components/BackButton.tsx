"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function BackButton({ fallback = "/films" }: { fallback?: string }) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  if (!canGoBack) return null;

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
