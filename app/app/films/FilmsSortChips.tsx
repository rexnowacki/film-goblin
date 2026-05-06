"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import type { FilmsSort } from "@/lib/queries/films";

interface Props {
  currentSort: FilmsSort;
  currentQ: string;
}

const CHIPS: { value: FilmsSort; label: string }[] = [
  { value: "added", label: "Recently added" },
  { value: "price_low", label: "Price drops" },
  { value: "watchlisted", label: "Most watchlisted" },
  { value: "release", label: "Release year" },
];

export default function FilmsSortChips({ currentSort, currentQ }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // If currentSort is one of the dropped values (title, price_high), no chip
  // is selected; the first chip becomes the tab-stop so the row is reachable.
  const selectedIndex = CHIPS.findIndex(c => c.value === currentSort);
  const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex;

  function selectChip(value: FilmsSort) {
    const p = new URLSearchParams(params);
    if (value === "added") p.delete("sort"); else p.set("sort", value);
    if (currentQ) p.set("q", currentQ); else p.delete("q");
    p.delete("page");
    const s = p.toString();
    router.push(s ? `/films?${s}` : "/films");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = e.key === "ArrowRight"
      ? (idx + 1) % CHIPS.length
      : (idx - 1 + CHIPS.length) % CHIPS.length;
    chipRefs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label="Sort films" className="films-sort-chips">
      {CHIPS.map((chip, idx) => {
        const isSelected = chip.value === currentSort;
        return (
          <button
            key={chip.value}
            ref={el => { chipRefs.current[idx] = el; }}
            role="tab"
            type="button"
            aria-selected={isSelected}
            tabIndex={idx === tabStopIndex ? 0 : -1}
            onClick={() => selectChip(chip.value)}
            onKeyDown={e => onKeyDown(e, idx)}
            className="films-sort-chip"
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
