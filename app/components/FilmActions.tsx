"use client";

import { useState } from "react";
import WatchlistButton from "./WatchlistButton";
import OwnedButton from "./OwnedButton";

interface Props {
  filmId: string;
  initialOnWatchlist: boolean;
  initialOwned: boolean;
}

export default function FilmActions({ filmId, initialOnWatchlist, initialOwned }: Props) {
  const [onWatchlist, setOnWatchlist] = useState(initialOnWatchlist);

  return (
    <>
      <WatchlistButton
        filmId={filmId}
        initialOnList={onWatchlist}
        onChange={setOnWatchlist}
      />
      <OwnedButton
        filmId={filmId}
        initialOwned={initialOwned}
        onAdded={() => setOnWatchlist(false)}
      />
    </>
  );
}
