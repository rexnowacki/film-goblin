"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchFilmsUniversal, type FilmSearchHit } from "@/lib/actions/film-search";
import { useCachedTypeahead } from "@/lib/hooks/useCachedTypeahead";

export default function UniversalFilmSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emptyResults = useMemo(() => [] as FilmSearchHit[], []);
  const filter = useCallback((films: FilmSearchHit[], raw: string) => {
    const q = raw.toLowerCase();
    return films.filter(f =>
      f.title.toLowerCase().includes(q) ||
      f.director.toLowerCase().includes(q) ||
      String(f.year).includes(q)
    );
  }, []);
  const results = useCachedTypeahead(query, {
    search: searchFilmsUniversal,
    filter,
    empty: emptyResults,
  });

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMobileExpanded(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function goToFilm(id: string) {
    setOpen(false);
    setMobileExpanded(false);
    setQuery("");
    startTransition(() => router.push(`/film/${id}`));
  }

  function openMobileSearch() {
    setMobileExpanded(true);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const trimmed = query.trim();

  return (
    <div ref={wrapRef} className={`universal-film-search${mobileExpanded ? " is-mobile-expanded" : ""}`}>
      <button type="button" className="universal-film-search-trigger" aria-label="Find a film" onClick={openMobileSearch}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
      </button>
      <div className="search-pill universal-film-search-pill">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          name="global-film-search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Find a film"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Find a film..."
        />
      </div>

      {open && trimmed.length >= 2 && (
        <div className="feed-search-dropdown universal-film-search-dropdown">
          {results.length === 0 ? (
            <div style={{ padding: "12px 16px", fontStyle: "italic", color: "var(--muted)", fontSize: 13 }}>No matches.</div>
          ) : (
            results.map(f => (
              <button key={f.id} type="button" className="feed-search-item" onClick={() => goToFilm(f.id)}>
                {f.artwork_url ? (
                  <img src={f.artwork_url} alt="" width={28} height={42} style={{ objectFit: "cover", border: "1px solid var(--muted)" }} />
                ) : (
                  <div style={{ width: 28, height: 42, background: "var(--void-2)" }} />
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left", minWidth: 0 }}>
                  <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.director} · {f.year}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
