"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FeedRow from "./activity/FeedRow";
import SystemEventRow from "./activity/SystemEventRow";
import FeedCardSkeleton from "./skeletons/FeedCardSkeleton";
import type { EnrichedActivity, FeedItem } from "@/lib/queries/activity";
import { groupFeed } from "@/lib/queries/group-activity";
import { loadMoreFeed } from "@/lib/actions/feed-load-more";
import { composeFeed } from "@/lib/feed-events/compose";
import { resolvePitTiers } from "@/lib/feed-events/pitCadence";
import type { PitTier } from "@/lib/feed-events/tier";
import type { SystemFeedEvent } from "@/lib/feed-events/types";

type Tab = "all" | "coven" | "recs";

const MATCHERS: Record<Tab, (k: EnrichedActivity["kind"]) => boolean> = {
  all: () => true,
  coven: () => true,
  recs: (k) => k === "recommendation_sent",
};

// Mirrors TAB_KINDS in home/page.tsx — passed to loadMoreFeed so pagination
// stays scoped to the active tab, matching the server-rendered initial page.
const TAB_KINDS: Record<Tab, string[]> = {
  all: [],
  coven: [],
  recs: ["recommendation_sent"],
};

const TAB_SCOPES: Record<Tab, "site" | "coven"> = {
  all: "site",
  coven: "coven",
  recs: "coven",
};

// System rows are shown only on the "all" tab — they have no actor/kind to
// scope by "coven"/"recs", so any non-"all" tab excludes them outright.
function feedItemMatches(item: FeedItem, tab: Tab, matcher: (k: EnrichedActivity["kind"]) => boolean): boolean {
  if (item.type === "system") return tab === "all";
  if (item.type === "group") return matcher(item.group.kind);
  return matcher(item.activity.kind);
}

interface Props {
  initialItems: EnrichedActivity[];
  initialCursor: string | null;
  initialDone: boolean;
  filters: { actorId?: string; filmId?: string };
  // System feed events + the date seed composeFeed was seeded with on the
  // server, so client-side re-composition (as more user items page in)
  // stays deterministic within the day. Empty/undefined disables system
  // rows entirely (e.g. filtered actor/film views never pass these).
  systemEvents?: SystemFeedEvent[];
  dateSeed?: string;
  children?: ReactNode;
}

export default function FeedTabs({ initialItems, initialCursor, initialDone, filters, systemEvents, dateSeed, children }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const rawTab = params.get("tab");
  const urlTab: Tab = rawTab === "coven" || rawTab === "recs" ? rawTab : "all";
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
  const tabRef = useRef(tab);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { doneRef.current = done; }, [done]);
  useEffect(() => { tabRef.current = tab; }, [tab]);

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
      const kinds = TAB_KINDS[tabRef.current];
      const res = await loadMoreFeed({
        before: cursorRef.current,
        scope: TAB_SCOPES[tabRef.current],
        actorId: filters.actorId,
        filmId: filters.filmId,
        kinds: kinds.length ? kinds : undefined,
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
    const query = p.toString();
    router.push(query ? `/home?${query}` : "/home");
  }

  const grouped = useMemo(() => groupFeed(items), [items]);
  // Weave system events into the grouped user feed. Recomputed as `grouped`
  // grows via loadMore, but always seeded from the same server-provided
  // dateSeed so the ratio-cap/no-stacking result stays stable within a day.
  //
  // FeedItem's variants don't carry `created_at` as a real property (it's
  // nested under `.activity`/`.group`/`.event`), and composeFeed's generic
  // constraint `U extends { created_at?: string }` triggers TS's "weak
  // type" check against a union with no shared property names. Wrapping
  // each item with an explicit `created_at` sidesteps that.
  // Raw composeFeed output, kept separate from `composed` below: it's the
  // ComposedItem<U> shape resolvePitTiers needs (user/system discriminant),
  // whereas `composed` immediately collapses back to FeedItem shape
  // (single/group/system) for the rest of the component. Tiers must be
  // resolved from THIS array, not the collapsed one.
  const composedRaw = useMemo(() => {
    if (!systemEvents || systemEvents.length === 0) return null;
    const seed = dateSeed ?? new Date().toISOString().slice(0, 10);
    const wrapped = grouped.map(item => ({
      item,
      created_at: item.type === "group" ? item.group.latestAt : item.type === "single" ? item.activity.created_at : item.event.created_at,
    }));
    return composeFeed(wrapped, systemEvents, seed, (w) => w.created_at);
  }, [grouped, systemEvents, dateSeed]);
  const composed = useMemo<FeedItem[]>(() => {
    if (!composedRaw) return grouped;
    return composedRaw.map(c => c.type === "system" ? { type: "system" as const, event: c.event } : c.item.item);
  }, [composedRaw, grouped]);
  const pitTiers = useMemo(
    () => composedRaw ? resolvePitTiers(composedRaw) : new Map<string, PitTier>(),
    [composedRaw],
  );
  const filtered = useMemo(
    () => composed.filter(i => feedItemMatches(i, tab, MATCHERS[tab])),
    [composed, tab],
  );
  const showFeedInsert = tab === "all" && !filters.actorId && !filters.filmId;
  const emptyCopy = tab === "all"
    ? "No activity yet."
    : tab === "coven"
      ? "No coven activity yet. Visit /coven to follow someone."
      : "No recommendations yet.";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
        {(["all", "coven", "recs"] as Tab[]).map(t => (
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
        {showFeedInsert && children}
        {filtered.length === 0 ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6, padding: "20px 0" }}>
            {emptyCopy}
          </div>
        ) : (
          filtered.map(item =>
            item.type === "system" ? (
              <SystemEventRow key={item.event.id} event={item.event} tier={pitTiers.get(item.event.id) ?? "whisper"} />
            ) : (
              <FeedRow
                key={item.type === "group" ? item.group.key : item.activity.id}
                item={item}
              />
            )
          )
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
