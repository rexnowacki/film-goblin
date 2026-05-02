"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FeedRow from "./activity/FeedRow";
import FeedCardSkeleton from "./skeletons/FeedCardSkeleton";
import type { EnrichedActivity, FeedItem } from "@/lib/queries/activity";
import { groupFeed } from "@/lib/queries/group-activity";
import { loadMoreFeed } from "@/lib/actions/feed-load-more";

type Tab = "all" | "reviews" | "recs" | "lists";

const MATCHERS: Record<Tab, (k: EnrichedActivity["kind"]) => boolean> = {
  all: () => true,
  reviews: (k) => k === "review_published",
  recs: (k) => k === "recommendation_sent",
  lists: (k) => k === "list_created" || k === "list_film_added",
};

function feedItemMatches(item: FeedItem, matcher: (k: EnrichedActivity["kind"]) => boolean): boolean {
  if (item.type === "single") return matcher(item.activity.kind);
  return matcher(item.group.kind);
}

interface Props {
  initialItems: EnrichedActivity[];
  initialCursor: string | null;
  initialDone: boolean;
  filters: { actorId?: string; filmId?: string };
}

export default function FeedTabs({ initialItems, initialCursor, initialDone, filters }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const urlTab = (params.get("tab") as Tab) || "all";
  const [tab, setTab] = useState<Tab>(urlTab);

  // Cumulative un-grouped activity, deduped by id. Reset whenever the
  // server-rendered initial set changes (filter param change → fresh server
  // render hands new initialItems → wipe local state).
  const [items, setItems] = useState<EnrichedActivity[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [done, setDone] = useState<boolean>(initialDone);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset cumulative state on filter / initialItems change.
  useEffect(() => {
    setItems(initialItems);
    setCursor(initialCursor);
    setDone(initialDone);
  }, [initialItems, initialCursor, initialDone]);

  useEffect(() => { setTab(urlTab); }, [urlTab]);

  useEffect(() => {
    function onFocus() { router.refresh(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);

  // IntersectionObserver: when the sentinel enters the viewport, fetch the
  // next page. Guard against double-fires while a request is in flight.
  useEffect(() => {
    if (done || !cursor) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      async (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (loading || done || !cursor) return;
        setLoading(true);
        try {
          const res = await loadMoreFeed({
            before: cursor,
            actorId: filters.actorId,
            filmId: filters.filmId,
          });
          setItems(prev => {
            const seen = new Set(prev.map(i => i.id));
            const merged = [...prev];
            for (const it of res.items) if (!seen.has(it.id)) merged.push(it);
            return merged;
          });
          setCursor(res.nextCursor);
          setDone(res.done);
        } finally {
          setLoading(false);
        }
      },
      { rootMargin: "400px 0px" }, // start fetching ~400px before the sentinel hits the viewport
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, done, loading, filters.actorId, filters.filmId]);

  function pickTab(next: Tab) {
    const p = new URLSearchParams(params);
    if (next === "all") p.delete("tab"); else p.set("tab", next);
    router.push(`/home?${p.toString()}`);
  }

  // Group + filter from the cumulative list. Memoized so adding 20 items
  // doesn't re-group on unrelated re-renders.
  const grouped = useMemo(() => groupFeed(items), [items]);
  const filtered = useMemo(
    () => grouped.filter(i => feedItemMatches(i, MATCHERS[tab])),
    [grouped, tab],
  );

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

      {!done && cursor && (
        <div ref={sentinelRef} style={{ minHeight: 1 }}>
          {loading && (
            <div style={{ display: "grid", gap: 0, paddingTop: 16 }}>
              <FeedCardSkeleton />
              <FeedCardSkeleton />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
