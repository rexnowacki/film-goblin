"use client";

import { useState } from "react";
import WatchlistButton from "./WatchlistButton";
import OwnedButton from "./OwnedButton";
import WatchedButton from "./WatchedButton";

interface Props {
  filmId: string;
  filmTitle: string;
  initialOnWatchlist: boolean;
  initialOwned: boolean;
  initialWatchCount: number;
}

export default function FilmActions({ filmId, filmTitle, initialOnWatchlist, initialOwned, initialWatchCount }: Props) {
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
      <WatchedButton
        filmId={filmId}
        filmTitle={filmTitle}
        initialCount={initialWatchCount}
        onLogged={() => setOnWatchlist(false)}
      />
    </>
  );
}
