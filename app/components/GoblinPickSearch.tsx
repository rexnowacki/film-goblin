"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { searchFeedTargets } from "@/lib/actions/feed-search";
import { setGoblinPick } from "@/lib/actions/admin/goblin-pick";
import type { GoblinPickFilm } from "@/lib/queries/goblin-pick";

interface Props {
  current: GoblinPickFilm | null;
}

export default function GoblinPickSearch({ current }: Props) {
  const [query, setQuery] = useState("");
  const [films, setFilms] = useState<{ id: string; title: string; year: number; director: string; artwork_url: string | null }[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setFilms([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await searchFeedTargets(q);
      if (!cancelled) setFilms(res.films);
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function pick(filmId: string, title: string) {
    setSaving(true);
    setOpen(false);
    setQuery("");
    startTransition(async () => {
      const result = await setGoblinPick(filmId);
      setSaving(false);
      if (result.ok) setSaved(title);
    });
  }

  return (
    <div>
      {current && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, padding: 14, border: "1px solid #333", background: "var(--void-2)" }}>
          {current.artwork_url && (
            <img src={current.artwork_url} alt="" width={44} height={66} style={{ objectFit: "cover" }} />
          )}
          <div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--bone)", marginBottom: 2 }}>
              Current: <strong>{current.title}</strong>
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)" }}>
              {current.director} · {current.year}
            </div>
          </div>
        </div>
      )}

      {saved && (
        <div style={{ marginBottom: 14, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--accent)" }}>
          ✓ Goblin Pick updated to "{saved}"
        </div>
      )}

      <div ref={wrapRef} style={{ position: "relative" }}>
        <div className="search-pill">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            type="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Search films…"
            value={query}
            disabled={saving}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
        </div>

        {open && query.trim().length >= 2 && (
          <div className="feed-search-dropdown">
            {films.length === 0 ? (
              <div style={{ padding: "12px 16px", fontStyle: "italic", color: "var(--muted)", fontSize: 13 }}>No matches.</div>
            ) : (
              films.map(f => (
                <button key={f.id} type="button" className="feed-search-item" onClick={() => pick(f.id, f.title)}>
                  {f.artwork_url ? (
                    <img src={f.artwork_url} alt="" width={28} height={42} style={{ objectFit: "cover", border: "1px solid var(--muted)" }} />
                  ) : (
                    <div style={{ width: 28, height: 42, background: "var(--void-2)" }} />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                    <span style={{ fontSize: 13 }}>{f.title}</span>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{f.director} · {f.year}</span>
                  </div>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--accent)", letterSpacing: "0.06em" }}>
                    Set Pick →
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
