"use client";

import { useMemo, useState } from "react";
import FilmPoster from "@/components/FilmPoster";
import { filterFilmsByLanes, type DbFilm } from "./films-step-logic";

interface Props {
  films: DbFilm[];
  laneTagIds: string[];
  onNext: (filmIds: string[]) => void;
  onBack: () => void;
}

const MIN_PICKS = 3;
const MAX_PICKS = 10;

export default function FilmsStep({ films, laneTagIds, onNext, onBack }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const displayFilms = useMemo(() => filterFilmsByLanes(films, laneTagIds), [films, laneTagIds]);

  function toggleFilm(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : s.length < MAX_PICKS ? [...s, id] : s);
  }

  const canProceed = selected.length >= MIN_PICKS;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <p className="caps" style={{ fontSize: 11, color: "var(--muted)" }}>
        Pick films for your watchlist — at least {MIN_PICKS}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10 }}>
        {displayFilms.map(film => {
          const isSelected = selected.includes(film.id);
          return (
            <button key={film.id} type="button" onClick={() => toggleFilm(film.id)}
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", position: "relative" }}
            >
              <FilmPoster
                film={film as any}
                size="sm"
                style={{
                  width: "100%",
                  height: "auto",
                  aspectRatio: "2 / 3",
                  outline: isSelected ? "3px solid var(--accent)" : "none",
                  outlineOffset: 2,
                  opacity: !canProceed || isSelected ? 1 : 0.6,
                }}
              />
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" onClick={onBack} className="btn btn-outline btn-sm">← Back</button>
        <button type="button" onClick={() => onNext(selected)} disabled={!canProceed}
          className="btn btn-lg" style={{ opacity: canProceed ? 1 : 0.4 }}>
          Next → ({selected.length}/{MIN_PICKS}+)
        </button>
      </div>
    </div>
  );
}
