"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ActivityRow from "./activity/ActivityRow";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Tab = "all" | "reviews" | "recs" | "lists";

const MATCHERS: Record<Tab, (k: EnrichedActivity["kind"]) => boolean> = {
  all: () => true,
  reviews: (k) => k === "review_published",
  recs: (k) => k === "recommendation_sent",
  lists: (k) => k === "list_created" || k === "list_film_added",
};

interface Props { items: EnrichedActivity[]; }

export default function FeedTabs({ items }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const urlTab = (params.get("tab") as Tab) || "all";
  const [tab, setTab] = useState<Tab>(urlTab);

  useEffect(() => { setTab(urlTab); }, [urlTab]);

  useEffect(() => {
    function onFocus() { router.refresh(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);

  function pickTab(next: Tab) {
    const p = new URLSearchParams(params);
    if (next === "all") p.delete("tab"); else p.set("tab", next);
    router.push(`/home?${p.toString()}`);
  }

  const filtered = items.filter(i => MATCHERS[tab](i.kind));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
        {(["all", "reviews", "recs", "lists"] as Tab[]).map(t => (
          <button key={t} onClick={() => pickTab(t)} className="caps" style={{
            background: tab === t ? "var(--accent)" : "transparent",
            color: tab === t ? "var(--accent-ink)" : "var(--muted)",
            border: "1px solid " + (tab === t ? "var(--accent)" : "#333"),
            padding: "6px 12px", fontSize: 10, cursor: "pointer",
            fontFamily: "var(--font-ui)", fontWeight: 700,
          }}>{t}</button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 0 }}>
        {filtered.length === 0 ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6, padding: "20px 0" }}>
            No activity yet. Visit <a href="/people" style={{ color: "var(--accent)" }}>/people</a> to follow someone.
          </div>
        ) : (
          filtered.map(item => <ActivityRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
