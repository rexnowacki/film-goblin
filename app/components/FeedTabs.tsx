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
import { enforcePitPositionRules } from "@/lib/feed-events/pitPosition";
import { PIT_ARCHIVE_PAGE_SIZE } from "@/lib/feed-events/pitArchive";
import { shouldBackfillFeed } from "@/lib/feed/backfill";
import type { PitTier } from "@/lib/feed-events/tier";
import type { SystemFeedEvent } from "@/lib/feed-events/types";
import PitArchiveTab from "./PitArchiveTab";

type Tab = "all" | "coven" | "recs" | "pit";

const MATCHERS: Record<Tab, (k: EnrichedActivity["kind"]) => boolean> = {
  all: () => true,
  coven: () => true,
  recs: (k) => k === "recommendation_sent",
  pit: () => false,
};

// Mirrors TAB_KINDS in home/page.tsx — passed to loadMoreFeed so pagination
// stays scoped to the active tab, matching the server-rendered initial page.
const TAB_KINDS: Record<Tab, string[]> = {
  all: [],
  coven: [],
  recs: ["recommendation_sent"],
  pit: [],
};

const TAB_SCOPES: Record<Tab, "site" | "coven"> = {
  all: "site",
  coven: "coven",
  recs: "coven",
  pit: "site",
};

// System rows are shown only on the "all" tab — they have no actor/kind to
// scope by "coven"/"recs", so any non-"all" tab excludes them outright.
function feedItemMatches(item: FeedItem, tab: Tab, matcher: (k: EnrichedActivity["kind"]) => boolean): boolean {
  if (item.type === "system") return tab === "all";
  if (item.type === "group") {
    return item.group.kind === "hoard_added"
      ? matcher("watchlist_added") || matcher("library_added")
      : matcher("watch_logged");
  }
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
  pitArchive?: SystemFeedEvent[];
  children?: ReactNode;
}

export default function FeedTabs({ initialItems, initialCursor, initialDone, filters, systemEvents, dateSeed, pitArchive, children }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const rawTab = params.get("tab");
  const urlTab: Tab = rawTab === "coven" || rawTab === "recs" || rawTab === "pit" ? rawTab : "all";
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
  const scopeVersionRef = useRef(0);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { doneRef.current = done; }, [done]);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset cumulative state on filter change (URL flip → fresh server render → new initialItems prop).
  useEffect(() => {
    scopeVersionRef.current += 1;
    cursorRef.current = initialCursor;
    doneRef.current = initialDone;
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
    const scopeVersion = scopeVersionRef.current;
    loadingRef.current = true;
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
      if (scopeVersion !== scopeVersionRef.current) return;
      setItems(prev => {
        const seen = new Set(prev.map(i => i.id));
        const merged = [...prev];
        for (const it of res.items) if (!seen.has(it.id)) merged.push(it);
        return merged;
      });
      cursorRef.current = res.nextCursor;
      doneRef.current = res.done;
      setCursor(res.nextCursor);
      setDone(res.done);
    } finally {
      loadingRef.current = false;
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
  // Position rules (first-screen cap, min-gap) run on composeFeed's raw
  // output, before tier resolution -- a dropped item shouldn't consume
  // resolvePitTiers' full-card sliding-window budget either.
  const composedFiltered = useMemo(
    () => composedRaw ? enforcePitPositionRules(composedRaw) : null,
    [composedRaw],
  );
  const composed = useMemo<FeedItem[]>(() => {
    if (!composedFiltered) return grouped;
    return composedFiltered.map(c => c.type === "system" ? { type: "system" as const, event: c.event } : c.item.item);
  }, [composedFiltered, grouped]);
  const pitTiers = useMemo(
    () => composedFiltered ? resolvePitTiers(composedFiltered) : new Map<string, PitTier>(),
    [composedFiltered],
  );
  const filtered = useMemo(
    () => composed.filter(i => feedItemMatches(i, tab, MATCHERS[tab])),
    [composed, tab],
  );
  useEffect(() => {
    if (shouldBackfillFeed({
      renderedCount: filtered.length,
      done,
      loading,
      hasCursor: Boolean(cursor),
      tab,
    })) {
      void loadMore();
    }
  }, [cursor, done, filtered.length, loadMore, loading, tab]);
  const showFeedInsert = tab === "all" && !filters.actorId && !filters.filmId;
  const emptyCopy = tab === "all"
    ? "No activity yet."
    : tab === "coven"
      ? "No coven activity yet. Visit /coven to follow someone."
      : "No recommendations yet.";

  return (
    <div className="feed-stream">
      <div className="feed-stream__heading">
        <div><span className="eyebrow">The moving picture</span><h2>{tab === "all" ? "Everything stirring" : tab === "coven" ? "Your coven" : tab === "recs" ? "Passed hand to hand" : "From the Pit"}</h2></div>
        <span className="feed-stream__live"><i /> Live</span>
      </div>
      <div className="feed-tab-rail" role="tablist" aria-label="Feed views">
        {(["coven", "all", "recs", "pit"] as Tab[]).map(t => (
          <button key={t} onClick={() => pickTab(t)} role="tab" aria-selected={tab === t} className={`feed-tab-pill ${tab === t ? "is-active" : ""}`}>
            <span className="desktop-only">{t === "all" ? "All stirrings" : t === "coven" ? "My coven" : t === "recs" ? "Recommendations" : "Pit archive"}</span>
            <span className="mobile-only">{t === "all" ? "All" : t === "coven" ? "My coven" : t === "recs" ? "Recs" : "From the Pit"}</span>
          </button>
        ))}
      </div>
      {tab === "pit" ? (
        <PitArchiveTab
          initialEvents={pitArchive ?? []}
          initialCursor={pitArchive?.at(-1)?.created_at ?? null}
          initialDone={pitArchive ? pitArchive.length < PIT_ARCHIVE_PAGE_SIZE : true}
        />
      ) : <>
      <div className="feed-stream__rows">
        {showFeedInsert && children}
        {filtered.length === 0 ? (
          <div className="feed-stream__empty">
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
        <div ref={sentinelRef} className="feed-stream__sentinel">
          {loading ? (
            <div style={{ display: "grid", gap: 0 }}>
              <FeedCardSkeleton />
              <FeedCardSkeleton />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void loadMore()}
              className="btn btn-outline feed-stream__more"
            >
              Load more
            </button>
          )}
        </div>
      )}

      {done && filtered.length > 0 && (
        <div className="feed-stream__end">
          — you've reached the back of the grimoire —
        </div>
      )}
      </>}
    </div>
  );
}
