"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { addToWatchlist } from "@/lib/actions/watchlists";
import { addToLibrary } from "@/lib/actions/library";

interface Props {
  filmId: string;
  initialOnWatchlist: boolean;
  initialInLibrary?: boolean;
  children: ReactNode; // the FilmPoster (or wrapping element) the menu sits inside
}

/**
 * Hover-revealed quick-add affordance for poster grids on /films. Desktop
 * only (the + button is hidden under 720px via CSS). Click "+" → small menu
 * with two pills: Watchlist / Library. Clicking inside the affordance
 * stops propagation so the surrounding poster <Link> doesn't navigate.
 *
 * Default browse on /films excludes already-saved-or-owned films from the
 * grid, so initial flags are usually false. In search mode the exclusion is
 * lifted, so the page passes through real `initialOnWatchlist` /
 * `initialInLibrary` state for matched rows and the pills show ✓ disabled.
 */
export default function PosterQuickAdd({ filmId, initialOnWatchlist, initialInLibrary = false, children }: Props) {
  const [open, setOpen] = useState(false);
  const [onWatchlist, setOnWatchlist] = useState(initialOnWatchlist);
  const [inLibrary, setInLibrary] = useState(initialInLibrary);
  const [pending, setPending] = useState<"wl" | "lib" | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
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
    } catch {
      setOnWatchlist(false);
    } finally {
      setPending(null);
      setOpen(false);
    }
  }

  async function clickLibrary(e: React.MouseEvent) {
    stopAndPrevent(e);
    if (inLibrary || pending !== null) return;
    setPending("lib");
    setInLibrary(true);
    try {
      await addToLibrary(filmId);
    } catch {
      setInLibrary(false);
    } finally {
      setPending(null);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="poster-quick-add">
      {children}
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
    </div>
  );
}
