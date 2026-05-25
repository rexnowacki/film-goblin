"use client";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import { useToast } from "@/components/ToastProvider";
import { addToLibrary, removeFromLibrary } from "@/lib/actions/library";
import { removeFromWatchlist } from "@/lib/actions/watchlists";
import { logWatch } from "@/lib/actions/watched";
import { buildShareUrl, buildShareMessage } from "@/components/ShareFilmButton";
import dynamic from "next/dynamic";
const WatchModal = dynamic(() => import("@/components/WatchModal"));

const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

type Kind = "watchlist" | "library";

interface Props {
  kind: Kind;
  filmId: string;
  filmTitle: string;
  filmYear: number;
  sharerUsername: string | null;
}

/**
 * Mobile-only ⋯ button overlaid on a poster. Tap → BottomSheet w/
 * page-specific actions. Mirrors the /films mobile action sheet
 * (PosterQuickAdd) but for hoard / grimoire surfaces, where the actions
 * are different (cross-move + remove + share, instead of add).
 *
 * Hidden on desktop via the existing .poster-quick-add__mobile-btn
 * media query (display: none default, inline-flex ≤720px).
 */
export default function PosterMobileActions({ kind, filmId, filmTitle, filmYear, sharerUsername }: Props) {
  const [open, setOpen] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function stopAndPrevent(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function moveToGrimoire(e: React.MouseEvent) {
    stopAndPrevent(e);
    startTransition(async () => {
      try {
        await addToLibrary(filmId);
        toast("Added to grimoire");
      } catch {
        toast("Failed to move");
      } finally {
        setOpen(false);
      }
    });
  }

  function removeWatchlist(e: React.MouseEvent) {
    stopAndPrevent(e);
    startTransition(async () => {
      try {
        await removeFromWatchlist(filmId);
        toast("Removed from watchlist");
      } catch {
        toast("Failed to remove");
      } finally {
        setOpen(false);
      }
    });
  }

  function removeGrimoire(e: React.MouseEvent) {
    stopAndPrevent(e);
    startTransition(async () => {
      try {
        await removeFromLibrary(filmId);
        toast("Removed from grimoire");
      } catch {
        toast("Failed to remove");
      } finally {
        setOpen(false);
      }
    });
  }

  async function share(e: React.MouseEvent) {
    stopAndPrevent(e);
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
      setOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { stopAndPrevent(e); setOpen(true); }}
        className="poster-quick-add__mobile-btn"
        aria-label="Film actions"
      >
        ⋯
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={filmTitle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px 4px" }}>
          <button
            type="button"
            className="poster-action-row"
            onClick={(e) => { stopAndPrevent(e); setOpen(false); setWatchOpen(true); }}
          >
            ✦ Log a watch
          </button>
          {kind === "watchlist" && (
            <>
              <button type="button" className="poster-action-row" disabled={pending} onClick={moveToGrimoire}>
                + Add to grimoire
              </button>
              <button type="button" className="poster-action-row" disabled={pending} onClick={removeWatchlist}>
                Remove from watchlist
              </button>
            </>
          )}
          {kind === "library" && (
            <button type="button" className="poster-action-row" disabled={pending} onClick={removeGrimoire}>
              Remove from grimoire
            </button>
          )}
          <button type="button" className="poster-action-row" onClick={share}>
            ✦ Share film
          </button>
        </div>
      </BottomSheet>

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
    </>
  );
}
