"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { FilmsSort } from "@/lib/queries/films";

interface Props {
  currentSort: FilmsSort;
  currentQ: string;
}

const OPTIONS: { value: FilmsSort; label: string }[] = [
  { value: "added", label: "Date added (newest)" },
  { value: "release", label: "Release year (newest)" },
  { value: "title", label: "Alphabetical" },
  { value: "watchlisted", label: "Most watchlisted" },
  { value: "price_low", label: "Lowest price" },
  { value: "price_high", label: "Highest price" },
];

export default function FilmsSortSelect({ currentSort, currentQ }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as FilmsSort;
    const p = new URLSearchParams(params);
    if (value === "release") p.delete("sort"); else p.set("sort", value);
    if (currentQ) p.set("q", currentQ); else p.delete("q");
    p.delete("page"); // reset pagination when sort changes
    const s = p.toString();
    router.push(s ? `/films?${s}` : "/films");
  }

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>Sort</span>
      <select
        value={currentSort}
        onChange={onChange}
        style={{
          padding: "6px 10px",
          background: "var(--void-2)",
          color: "var(--bone)",
          border: "2px solid var(--muted)",
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        {OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
