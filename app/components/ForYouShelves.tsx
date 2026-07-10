"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DailyOmenHero from "./DailyOmenHero";
import ShelfCarousel from "./ShelfCarousel";
import { useToast } from "./ToastProvider";
import { createImpressionQueue } from "@/lib/fyp/impression-queue";
import { recordFypImpressions, setNotInterested, undoNotInterested } from "@/lib/actions/fyp";
import type { Shelf } from "@/lib/queries/fyp/shelves";
import type { ScoredFilm } from "@/lib/queries/fyp/score";
import type { FilmLite } from "@/lib/queries/fyp/forYou";

const DWELL_MS = 1000;

interface Props {
  omen: ScoredFilm | null;
  shelves: Shelf[];
  filmsEntries: Array<[string, FilmLite]>;
  watchlistIds: string[];
  libraryIds: string[];
  sharerUsername: string | null;
}

export default function ForYouShelves({
  omen, shelves, filmsEntries, watchlistIds, libraryIds, sharerUsername,
}: Props) {
  const filmsById = useMemo(() => new Map(filmsEntries), [filmsEntries]);
  const watchlistSet = useMemo(() => new Set(watchlistIds), [watchlistIds]);
  const librarySet = useMemo(() => new Set(libraryIds), [libraryIds]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // ── Impression logging ────────────────────────────────────────────────────
  const observerRef = useRef<IntersectionObserver | null>(null);
  const dwellTimers = useRef(new Map<Element, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const queue = createImpressionQueue(ids => void recordFypImpressions(ids));
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const filmId = (e.target as HTMLElement).dataset.filmId;
        if (!filmId) continue;
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          const t = setTimeout(() => queue.add(filmId), DWELL_MS);
          dwellTimers.current.set(e.target, t);
        } else {
          const t = dwellTimers.current.get(e.target);
          if (t) { clearTimeout(t); dwellTimers.current.delete(e.target); }
        }
      }
    }, { threshold: 0.5 });
    observerRef.current = io;

    const onHide = () => queue.flushNow();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      for (const t of dwellTimers.current.values()) clearTimeout(t);
      io.disconnect();
      queue.dispose();
    };
  }, []);

  const registerCard = useCallback((el: HTMLElement | null, _filmId: string) => {
    if (el) observerRef.current?.observe(el);
  }, []);

  // ── Dismissals ────────────────────────────────────────────────────────────
  const onDismiss = useCallback((filmId: string) => {
    setDismissed(prev => new Set(prev).add(filmId));
    void setNotInterested(filmId)
      .then(() => toast("Hidden from your For You"))
      .catch(() => {
        setDismissed(prev => {
          const next = new Set(prev);
          next.delete(filmId);
          return next;
        });
        toast("Couldn't hide that — try again.");
      });
  }, [toast]);

  const onUndo = useCallback((filmId: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.delete(filmId);
      return next;
    });
    void undoNotInterested(filmId).catch(() => toast("Couldn't undo — try again."));
  }, [toast]);

  const omenFilm = omen ? filmsById.get(omen.filmId) : undefined;

  if (!omenFilm && shelves.length === 0) {
    return (
      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6, padding: "40px 0" }}>
        Nothing to divine yet. Log or tag a few films and the goblin will find your scent.
      </div>
    );
  }

  return (
    <>
      {omen && omenFilm && (
        <div ref={el => registerCard(el as HTMLElement | null, omen.filmId)} data-film-id={omen.filmId}>
          <DailyOmenHero
            film={omenFilm}
            dismissed={dismissed.has(omen.filmId)}
            onWatchlist={watchlistSet.has(omen.filmId)}
            inLibrary={librarySet.has(omen.filmId)}
            sharerUsername={sharerUsername}
            onDismiss={onDismiss}
            onUndo={onUndo}
          />
        </div>
      )}
      {shelves.map(shelf => (
        <ShelfCarousel
          key={shelf.id}
          shelf={shelf}
          filmsById={filmsById}
          dismissed={dismissed}
          onDismiss={onDismiss}
          onUndo={onUndo}
          registerCard={registerCard}
          watchlistIds={watchlistSet}
          libraryIds={librarySet}
          sharerUsername={sharerUsername}
        />
      ))}
    </>
  );
}
