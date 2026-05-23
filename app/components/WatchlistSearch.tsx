"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export default function WatchlistSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [, start] = useTransition();
  const lastHrefRef = useRef(`/watchlist?${params.toString()}`);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(params);
      const next = q.trim();
      if (next) p.set("q", next);
      else p.delete("q");
      const qs = p.toString();
      const href = qs ? `/watchlist?${qs}` : "/watchlist";
      if (href === lastHrefRef.current) return;
      lastHrefRef.current = href;
      start(() => router.replace(href, { scroll: false }));
    }, 220);
    return () => clearTimeout(t);
  }, [params, q, router, start]);

  return (
    <div className="search-pill">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
      </svg>
      <input
        type="search"
        name="watchlist-search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Search your watchlist"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Title, director, year…"
      />
    </div>
  );
}
