"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ForYouRow from "./ForYouRow";
import FeedCardSkeleton from "./skeletons/FeedCardSkeleton";
import { loadMoreForYou } from "@/lib/actions/fyp/load-more";
import type { ScoredFilm } from "@/lib/queries/fyp/score";
import type { FilmLite } from "@/lib/queries/fyp/forYou";

interface Props {
  initialItems: ScoredFilm[];
  initialFilmsById: Array<[string, FilmLite]>;
  initialCursor: string | null;
  initialDone: boolean;
}

export default function ForYouFeed({ initialItems, initialFilmsById, initialCursor, initialDone }: Props) {
  const [items, setItems] = useState(initialItems);
  const [filmsById, setFilmsById] = useState(new Map(initialFilmsById));
  const [cursor, setCursor] = useState(initialCursor);
  const [done, setDone] = useState(initialDone);
  const [loading, setLoading] = useState(false);

  // Refs mirror state for the IntersectionObserver callback so the observer
  // doesn't need to be torn down + rebuilt on every load cycle (iOS Safari
  // is flaky about re-firing intersection callbacks for newly-attached observers).
  const loadingRef = useRef(false);
  const cursorRef = useRef(cursor);
  const doneRef = useRef(done);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { doneRef.current = done; }, [done]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || doneRef.current || !cursorRef.current) return;
    setLoading(true);
    try {
      const res = await loadMoreForYou(cursorRef.current);
      setItems(prev => {
        const seen = new Set(prev.map(i => i.filmId));
        const merged = [...prev];
        for (const it of res.items) if (!seen.has(it.filmId)) merged.push(it);
        return merged;
      });
      setFilmsById(prev => {
        const next = new Map(prev);
        for (const [id, f] of res.filmsByIdEntries) if (!next.has(id)) next.set(id, f);
        return next;
      });
      setCursor(res.nextCursor);
      setDone(res.done);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) void loadMore(); },
      { rootMargin: "600px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  if (items.length === 0) {
    return (
      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6, padding: "40px 0" }}>
        No recommendations yet. Tag a few films you&apos;ve watched to seed your affinity, or set lanes on /settings.
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "grid", gap: 24 }}>
        {items.map(scored => {
          const film = filmsById.get(scored.filmId);
          if (!film) return null;
          return <ForYouRow key={scored.filmId} film={film} reason={scored.topReason} />;
        })}
      </div>
      {!done && cursor && (
        <div ref={sentinelRef} style={{ marginTop: 32 }}>
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
                padding: "10px 20px",
                background: "transparent",
                border: "1px solid var(--accent)",
                color: "var(--accent)",
                fontSize: 11,
                fontFamily: "var(--font-ui)",
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.06em",
                margin: "0 auto",
                display: "block",
              }}
            >
              Load more
            </button>
          )}
        </div>
      )}
      {done && items.length > 0 && (
        <div style={{ textAlign: "center", padding: "32px 0 8px", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)", opacity: 0.6 }}>
          — that&apos;s everything we have for you right now —
        </div>
      )}
    </>
  );
}
