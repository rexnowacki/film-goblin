"use client";

import { useEffect, useState, useTransition } from "react";
import { addToWatchlist, removeFromWatchlist } from "@/lib/actions/watchlists";

interface Props {
  filmId: string;
  initialOnList: boolean;
  onChange?: (next: boolean) => void;
}

export default function WatchlistButton({ filmId, initialOnList, onChange }: Props) {
  const [onList, setOnList] = useState(initialOnList);
  const [pending, start] = useTransition();

  useEffect(() => {
    setOnList(initialOnList);
  }, [initialOnList]);

  function toggle() {
    start(async () => {
      try {
        if (onList) {
          await removeFromWatchlist(filmId);
          setOnList(false);
          onChange?.(false);
        } else {
          await addToWatchlist(filmId);
          setOnList(true);
          onChange?.(true);
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  return (
    <button
      className="btn btn-outline btn-lg"
      onClick={toggle}
      disabled={pending}
      style={{ color: "var(--bone)", borderColor: "var(--bone)" }}
    >
      {onList ? "✓ On Watchlist" : "+ Watchlist"}
    </button>
  );
}
