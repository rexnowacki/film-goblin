"use client";

import { useState, useTransition } from "react";
import { addToWatchlist, removeFromWatchlist } from "@/lib/actions/watchlists";

interface Props {
  filmId: string;
  initialOnList: boolean;
}

export default function WatchlistButton({ filmId, initialOnList }: Props) {
  const [onList, setOnList] = useState(initialOnList);
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      try {
        if (onList) {
          await removeFromWatchlist(filmId);
          setOnList(false);
        } else {
          await addToWatchlist(filmId);
          setOnList(true);
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
