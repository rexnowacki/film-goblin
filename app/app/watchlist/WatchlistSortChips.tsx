"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import type { WatchlistSort } from "@/lib/queries/sort-watchlist";

interface Props {
  currentSort: WatchlistSort;
}

const CHIPS: { value: WatchlistSort; label: string }[] = [
  { value: "drop", label: "Biggest drop" },
  { value: "recency", label: "Recently added" },
  { value: "price-low", label: "Lowest price" },
  { value: "alphabetical", label: "A→Z" },
];

export default function WatchlistSortChips({ currentSort }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedIndex = CHIPS.findIndex(c => c.value === currentSort);
  const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex;

  function selectChip(value: WatchlistSort) {
    const p = new URLSearchParams(params);
    if (value === "drop") p.delete("sort"); else p.set("sort", value);
    const s = p.toString();
    router.push(s ? `/watchlist?${s}` : "/watchlist");
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
    <div role="tablist" aria-label="Sort watchlist" className="films-sort-chips">
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
