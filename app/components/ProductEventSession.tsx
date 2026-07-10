"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();

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
    if (searchParams.get("src") !== "return_contract") return;
    const kind = searchParams.get("contract_kind");
    const key = searchParams.get("contract_key");
    if (!kind || !key) return;
    const marker = `fg_return_contract_acted:${key}`;
    if (window.sessionStorage.getItem(marker)) return;
    window.sessionStorage.setItem(marker, "1");
    trackProductEvent({
      event_name: "return_contract_acted",
      path: pathname,
      properties: { contract_kind: kind, contract_key: key, action: "navigate" },
    });
  }, [pathname, searchParams]);

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
