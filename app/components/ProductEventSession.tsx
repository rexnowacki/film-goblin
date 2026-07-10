"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { flushProductEvents, trackProductEvent } from "@/lib/product-events/browser";
import { getOrCreateProductSession } from "@/lib/product-events/session";

function entrySource(): "direct" | "internal" | "external" {
  if (!document.referrer) return "direct";
  try {
    return new URL(document.referrer).origin === window.location.origin ? "internal" : "external";
  } catch {
    return "direct";
  }
}

export default function ProductEventSession() {
  const pathname = usePathname();

  useEffect(() => {
    const session = getOrCreateProductSession(window.sessionStorage);
    if (session.isNew) {
      trackProductEvent({
        event_name: "session_started",
        path: pathname,
        properties: { entry_source: entrySource() },
      });
    }
  }, [pathname]);

  useEffect(() => {
    const flush = () => { void flushProductEvents(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  return null;
}
