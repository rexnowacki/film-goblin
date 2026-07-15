"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadMorePitArchive } from "@/lib/actions/pit-archive";
import { filterArchiveByBucket, type PitBucket } from "@/lib/feed-events/pitArchive";
import { resolvePitTiers } from "@/lib/feed-events/pitCadence";
import type { SystemFeedEvent } from "@/lib/feed-events/types";
import SystemEventRow from "./activity/SystemEventRow";
import FeedCardSkeleton from "./skeletons/FeedCardSkeleton";

const FILTERS: Array<{ value: PitBucket | null; label: string }> = [
  { value: null, label: "Everything" },
  { value: "deals", label: "Deals" },
  { value: "free", label: "Free" },
  { value: "catalog", label: "Catalog" },
  { value: "hauntings", label: "Hauntings" },
];

interface Props {
  initialEvents: SystemFeedEvent[];
  initialCursor: string | null;
  initialDone: boolean;
}

/**
 * A deliberately separate pagination path from FeedTabs' user activity.
 * Most importantly, its SystemEventRows opt out of Pit impressions: browsing
 * the archive must never consume the main feed's permanent seen state or
 * daily budget.
 */
export default function PitArchiveTab({ initialEvents, initialCursor, initialDone }: Props) {
  const [events, setEvents] = useState(initialEvents);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [done, setDone] = useState(initialDone);
  const [loading, setLoading] = useState(false);
  const [bucket, setBucket] = useState<PitBucket | null>(null);

  const loadingRef = useRef(false);
  const cursorRef = useRef(cursor);
  const doneRef = useRef(done);
  const scopeVersionRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { doneRef.current = done; }, [done]);

  useEffect(() => {
    scopeVersionRef.current += 1;
    loadingRef.current = false;
    cursorRef.current = initialCursor;
    doneRef.current = initialDone;
    setEvents(initialEvents);
    setCursor(initialCursor);
    setDone(initialDone);
    setLoading(false);
  }, [initialEvents, initialCursor, initialDone]);

  const loadMore = useCallback(async () => {
    const before = cursorRef.current;
    if (loadingRef.current || doneRef.current || !before) return;
    const scopeVersion = scopeVersionRef.current;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await loadMorePitArchive({ before });
      if (scopeVersion !== scopeVersionRef.current) return;
      setEvents((previous) => {
        const seen = new Set(previous.map((event) => event.id));
        return [...previous, ...page.events.filter((event) => !seen.has(event.id))];
      });
      cursorRef.current = page.nextCursor;
      doneRef.current = page.done;
      setCursor(page.nextCursor);
      setDone(page.done);
    } finally {
      if (scopeVersion === scopeVersionRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px 0px", threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [loadMore]);

  const filtered = useMemo(() => filterArchiveByBucket(events, bucket), [events, bucket]);
  // Resolve visual density across the entire fetched archive, rather than the
  // active filter's subset, so changing chips never reclassifies a card.
  const tiers = useMemo(
    () => resolvePitTiers(events.map((event) => ({ type: "system" as const, event }))),
    [events],
  );

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }} aria-label="Filter Pit archive">
        {FILTERS.map((filter) => {
          const selected = bucket === filter.value;
          return (
            <button
              key={filter.label}
              type="button"
              className={selected ? "chip chip-filled" : "chip"}
              aria-pressed={selected}
              onClick={() => setBucket(filter.value)}
              style={{ cursor: "pointer", color: selected ? undefined : "var(--muted)" }}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 0 }}>
        {filtered.length === 0 ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6, padding: "20px 0" }}>
            {events.length === 0 ? "The pit is silent. Nothing has stirred yet." : "Nothing in this chamber yet."}
          </div>
        ) : (
          filtered.map((event) => (
            <SystemEventRow
              key={event.id}
              event={event}
              tier={tiers.get(event.id) ?? "whisper"}
              recordImpression={false}
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
              style={{ alignSelf: "center", padding: "10px 20px", background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)", fontSize: 11, fontFamily: "var(--font-ui)", fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}
            >
              Load more
            </button>
          )}
        </div>
      )}

      {done && events.length > 0 && (
        <div style={{ textAlign: "center", padding: "32px 0 8px", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)", opacity: 0.6 }}>
          — the archive has yielded its last omen —
        </div>
      )}
    </div>
  );
}
