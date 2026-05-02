"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { addToWatchlist } from "@/lib/actions/watchlists";
import { addToLibrary } from "@/lib/actions/library";
import { logWatch } from "@/lib/actions/watched";
import BottomSheet from "@/components/BottomSheet";
import { useToast } from "@/components/ToastProvider";
import { buildShareUrl, buildShareMessage } from "@/components/ShareFilmButton";
import WatchModal from "@/components/WatchModal";

const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

interface Props {
  filmId: string;
  initialOnWatchlist: boolean;
  initialInLibrary?: boolean;
  /** Required for mobile share action (used in the bottom sheet). */
  filmTitle?: string;
  filmYear?: number;
  sharerUsername?: string | null;
  children: ReactNode; // the FilmPoster (or wrapping element) the menu sits inside
}

/**
 * Poster quick-action affordance, two surfaces:
 *
 * Desktop (>720px): hover-revealed "+" button → small menu w/ Watchlist /
 * Library pills. Click "+" → menu open. Click outside → close.
 *
 * Mobile (≤720px): "⋯" button at the top-right (always visible — desktop
 * affordance is hover-driven and doesn't translate to touch). Tap → a
 * BottomSheet with three rows: Watchlist, Grimoire, Share. Add buttons
 * mirror the desktop pills' state (✓-disabled when already saved).
 *
 * Default browse on /films excludes already-saved-or-owned films from the
 * grid, so initial flags are usually false. In search mode the exclusion
 * is lifted, so the page passes through real `initialOnWatchlist` /
 * `initialInLibrary` state for matched rows and the buttons show
 * ✓ disabled.
 */
export default function PosterQuickAdd({
  filmId,
  initialOnWatchlist,
  initialInLibrary = false,
  filmTitle,
  filmYear,
  sharerUsername = null,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const [onWatchlist, setOnWatchlist] = useState(initialOnWatchlist);
  const [inLibrary, setInLibrary] = useState(initialInLibrary);
  const [pending, setPending] = useState<"wl" | "lib" | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function stopAndPrevent(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function clickWatchlist(e: React.MouseEvent) {
    stopAndPrevent(e);
    if (onWatchlist || pending !== null) return;
    setPending("wl");
    setOnWatchlist(true);
    try {
      await addToWatchlist(filmId);
      toast("Added to watchlist");
    } catch {
      setOnWatchlist(false);
      toast("Failed to add");
    } finally {
      setPending(null);
      setOpen(false);
      setSheetOpen(false);
    }
  }

  async function clickLibrary(e: React.MouseEvent) {
    stopAndPrevent(e);
    if (inLibrary || pending !== null) return;
    setPending("lib");
    setInLibrary(true);
    try {
      await addToLibrary(filmId);
      toast("Added to grimoire");
    } catch {
      setInLibrary(false);
      toast("Failed to add");
    } finally {
      setPending(null);
      setOpen(false);
      setSheetOpen(false);
    }
  }

  async function clickShare(e: React.MouseEvent) {
    stopAndPrevent(e);
    if (!filmTitle || !filmYear) return;
    const url = buildShareUrl(filmId, sharerUsername);
    const message = buildShareMessage(filmTitle, filmYear, url);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text: message });
        toast("Sharing…");
      } else {
        await navigator.clipboard.writeText(message);
        toast("Link copied");
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") return;
      toast("Copy failed");
    } finally {
      setSheetOpen(false);
    }
  }

  const canShare = !!(filmTitle && filmYear);

  return (
    <div ref={ref} className="poster-quick-add">
      {children}

      {/* Desktop hover-revealed "+" button */}
      <button
        type="button"
        onClick={(e) => { stopAndPrevent(e); setOpen(o => !o); }}
        className="poster-quick-add__btn"
        aria-label="Add to watchlist or library"
        aria-expanded={open}
      >
        +
      </button>
      {open && (
        <div className="poster-quick-add__menu" onClick={stopAndPrevent}>
          <button
            type="button"
            className="poster-quick-add__pill"
            disabled={onWatchlist || pending !== null}
            onClick={clickWatchlist}
          >
            {onWatchlist ? "✓ On Watchlist" : "+ Watchlist"}
          </button>
          <button
            type="button"
            className="poster-quick-add__pill"
            disabled={inLibrary || pending !== null}
            onClick={clickLibrary}
          >
            {inLibrary ? "✓ In Library" : "+ Library"}
          </button>
        </div>
      )}

      {/* Mobile ⋯ button + bottom sheet */}
      <button
        type="button"
        onClick={(e) => { stopAndPrevent(e); setSheetOpen(true); }}
        className="poster-quick-add__mobile-btn"
        aria-label="Film actions"
      >
        ⋯
      </button>
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={filmTitle ?? "Film actions"}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px 4px" }}>
          <button
            type="button"
            className="poster-action-row"
            onClick={(e) => { stopAndPrevent(e); setSheetOpen(false); setWatchOpen(true); }}
          >
            ✦ Log a watch
          </button>
          <button
            type="button"
            className="poster-action-row"
            disabled={onWatchlist || pending !== null}
            onClick={clickWatchlist}
          >
            {onWatchlist ? "✓ On watchlist" : "+ Add to watchlist"}
          </button>
          <button
            type="button"
            className="poster-action-row"
            disabled={inLibrary || pending !== null}
            onClick={clickLibrary}
          >
            {inLibrary ? "✓ In grimoire" : "+ Add to grimoire"}
          </button>
          {canShare && (
            <button
              type="button"
              className="poster-action-row"
              onClick={clickShare}
            >
              ✦ Share film
            </button>
          )}
        </div>
      </BottomSheet>

      {filmTitle && (
        <WatchModal
          open={watchOpen}
          mode="new"
          filmTitle={filmTitle}
          initial={{ watched_at: TODAY_ISO(), note: "", recommended: null }}
          onSave={async (values) => {
            await logWatch(filmId, values);
            toast("Watch logged");
            setWatchOpen(false);
          }}
          onClose={() => setWatchOpen(false)}
        />
      )}
    </div>
  );
}
