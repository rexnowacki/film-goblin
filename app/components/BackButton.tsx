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
        padding: 0,
        color: "var(--muted)",
        fontFamily: "var(--font-ui)",
        fontSize: 12,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      ← Back
    </button>
  );
}
