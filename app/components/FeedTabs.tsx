"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const [items, setItems] = useState<EnrichedActivity[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [done, setDone] = useState<boolean>(initialDone);
  const [loading, setLoading] = useState(false);

  // Refs mirror state for the loadMore callback below, so the
  // IntersectionObserver doesn't need to be torn down + rebuilt every
  // time loading / cursor / done changes (iOS Safari is flaky about
  // re-firing intersection callbacks for newly-attached observers).
  const loadingRef = useRef(false);
  const cursorRef = useRef(cursor);
  const doneRef = useRef(done);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { doneRef.current = done; }, [done]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset cumulative state on filter change (URL flip → fresh server render → new initialItems prop).
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

  const loadMore = useCallback(async () => {
    if (loadingRef.current || doneRef.current || !cursorRef.current) return;
    setLoading(true);
    try {
      const res = await loadMoreFeed({
        before: cursorRef.current,
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
  }, [filters.actorId, filters.filmId]);

  // IntersectionObserver — created once per filter scope and observes
  // the persistent sentinel. Reads loading/cursor/done from refs inside
  // loadMore so we don't have to disconnect + reconnect on every load cycle.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  function pickTab(next: Tab) {
    const p = new URLSearchParams(params);
    if (next === "all") p.delete("tab"); else p.set("tab", next);
    router.push(`/home?${p.toString()}`);
  }

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
        <div ref={sentinelRef} style={{ display: "flex", flexDirection: "column", alignItems: "stretch", marginTop: 16, gap: 12 }}>
          {loading ? (
            <div style={{ display: "grid", gap: 0 }}>
              <FeedCardSkeleton />
              <FeedCardSkeleton />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void loadMore()}
              className="caps"
              style={{
                alignSelf: "center",
                padding: "10px 20px",
                background: "transparent",
                border: "1px solid var(--accent)",
                color: "var(--accent)",
                fontSize: 11,
                fontFamily: "var(--font-ui)",
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.06em",
              }}
            >
              Load more
            </button>
          )}
        </div>
      )}

      {done && filtered.length > 0 && (
        <div style={{
          textAlign: "center",
          padding: "32px 0 8px",
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 13,
          color: "var(--muted)",
          opacity: 0.6,
        }}>
          — you've reached the back of the grimoire —
        </div>
      )}
    </div>
  );
}
