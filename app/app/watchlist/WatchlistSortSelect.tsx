"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { WatchlistSort } from "@/lib/queries/sort-watchlist";

interface Props {
  current: WatchlistSort;
}

const OPTIONS: { value: WatchlistSort; label: string }[] = [
  { value: "drop", label: "Price dropped" },
  { value: "recency", label: "Recently added" },
  { value: "price-low", label: "Lowest price" },
  { value: "alphabetical", label: "A → Z" },
];

export default function WatchlistSortSelect({ current }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as WatchlistSort;
    const p = new URLSearchParams(params);
    if (value === "drop") p.delete("sort"); else p.set("sort", value);
    p.delete("page"); // reset pagination when sort changes
    const s = p.toString();
    router.push(s ? `/watchlist?${s}` : "/watchlist");
  }

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>Sort</span>
      <select
        value={current}
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
