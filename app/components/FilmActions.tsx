"use client";

import { useState } from "react";
import WatchlistButton from "./WatchlistButton";
import OwnedButton from "./OwnedButton";
import WatchedButton from "./WatchedButton";
import ContinuationPrompt from "./continuations/ContinuationPrompt";

interface Props {
  filmId: string;
  filmTitle: string;
  initialOnWatchlist: boolean;
  initialOwned: boolean;
  initialWatchCount: number;
  currentlyShowing: boolean;
}

export default function FilmActions({ filmId, filmTitle, initialOnWatchlist, initialOwned, initialWatchCount, currentlyShowing }: Props) {
  const [onWatchlist, setOnWatchlist] = useState(initialOnWatchlist);
  const [continuation,setContinuation]=useState<"watchlist_added"|"watch_logged"|"library_added"|null>(null);

  return (
    <>
      <WatchlistButton
        filmId={filmId}
        initialOnList={onWatchlist}
        onChange={next=>{setOnWatchlist(next);if(next)setContinuation("watchlist_added");}}
      />
      <OwnedButton
        filmId={filmId}
        initialOwned={initialOwned}
        onAdded={() => {setOnWatchlist(false);setContinuation("library_added");}}
      />
      <WatchedButton
        filmId={filmId}
        filmTitle={filmTitle}
        initialCount={initialWatchCount}
        onWatchlist={onWatchlist}
        currentlyShowing={currentlyShowing}
        onLogged={(disposition) => {setOnWatchlist(disposition === "keep");setContinuation("watch_logged");}}
      />
      {continuation && (
        <ContinuationPrompt source={continuation} filmId={filmId}/>
      )}
    </>
  );
}
