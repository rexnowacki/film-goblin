"use client";

import type { ScoredFilm } from "@/lib/queries/fyp/score";
import type { FilmLite } from "@/lib/queries/fyp/forYou";
import type { Shelf } from "@/lib/queries/fyp/shelves";

export default function ForYouShelves({
  omen,
  shelves,
  filmsEntries,
  scoredEntries,
}: {
  omen: ScoredFilm | null;
  shelves: Shelf[];
  filmsEntries: Array<[string, FilmLite]>;
  scoredEntries: Array<[string, ScoredFilm]>;
}) {
  // Stub — Task 12 replaces this body with the real shelves UI.
  void filmsEntries;
  void scoredEntries;
  return (
    <div>
      {omen && <p>Omen: {omen.filmId}</p>}
      {shelves.map(shelf => (
        <p key={shelf.id}>{shelf.title}</p>
      ))}
    </div>
  );
}
