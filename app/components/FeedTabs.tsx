"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FeedRow from "./activity/FeedRow";
import type { EnrichedActivity, FeedItem } from "@/lib/queries/activity";

type Tab = "all" | "reviews" | "recs" | "lists";

const MATCHERS: Record<Tab, (k: EnrichedActivity["kind"]) => boolean> = {
  all: () => true,
  reviews: (k) => k === "review_published",
  recs: (k) => k === "recommendation_sent",
  lists: (k) => k === "list_created" || k === "list_film_added",
};

// FeedItem matcher: a single matches if its activity.kind matches; a group
// matches if its group.kind matches. In v1 only watchlist_added groups
// exist, so groups never appear in non-"all" tabs.
function feedItemMatches(item: FeedItem, matcher: (k: EnrichedActivity["kind"]) => boolean): boolean {
  if (item.type === "single") return matcher(item.activity.kind);
  return matcher(item.group.kind);
}

interface Props { items: FeedItem[]; }

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

  const filtered = items.filter(i => feedItemMatches(i, MATCHERS[tab]));

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
            No activity yet. Visit <a href="/coven" style={{ color: "var(--accent)" }}>/coven</a> to follow someone.
          </div>
        ) : (
          filtered.map(item => (
            <FeedRow
              key={item.type === "group" ? item.group.key : item.activity.id}
              item={item}
            />
          ))
        )}
      </div>
    </div>
  );
}
