"use client";

import { useEffect, useRef } from "react";
import { trackProductEvent } from "@/lib/product-events/browser";
import type { ReturnContractKind } from "@/lib/return-contract/types";

export default function ReturnContractTracker({ contractKey, kind }: { contractKey: string; kind: ReturnContractKind }) {
  const ref = useRef<HTMLDivElement>(null);
  const seenKeys = useRef(new Set<string>());
  useEffect(() => {
    const node = ref.current;
    if (!node || seenKeys.current.has(contractKey) || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
      seenKeys.current.add(contractKey);
      trackProductEvent({ event_name: "return_contract_viewed", properties: { contract_kind: kind, contract_key: contractKey } });
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [contractKey, kind]);
  return <div ref={ref} aria-hidden="true" className="return-contract-sentinel" />;
}
