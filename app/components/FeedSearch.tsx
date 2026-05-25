"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/ui/Avatar";
import { searchFeedTargets, type FeedSearchUser, type FeedSearchFilm } from "@/lib/actions/feed-search";
import { useCachedTypeahead } from "@/lib/hooks/useCachedTypeahead";

interface ActiveFilter {
  kind: "actor" | "film";
  id: string;
  label: string;
  artwork_url?: string | null;
  avatar_url?: string | null;
}

interface Props {
  active: ActiveFilter | null;
}

export default function FeedSearch({ active }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<FeedSearchUser[]>([]);
  const [films, setFilms] = useState<FeedSearchFilm[]>([]);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const emptyResults = useMemo(() => ({ users: [] as FeedSearchUser[], films: [] as FeedSearchFilm[] }), []);
  const results = useCachedTypeahead(query, {
    search: searchFeedTargets,
    filter: filterFeedSearchResults,
    empty: emptyResults,
  });

  useEffect(() => {
    setUsers(results.users);
    setFilms(results.films);
  }, [results]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function applyFilter(kind: "actor" | "film", id: string) {
    setOpen(false);
    setQuery("");
    startTransition(() => router.push(`/home?${kind}=${encodeURIComponent(id)}`));
  }

  function clearFilter() {
    startTransition(() => router.push(`/home`));
  }

  const hasResults = users.length > 0 || films.length > 0;

  return (
    <div ref={wrapRef} style={{ position: "relative", marginBottom: 16 }}>
      {active ? (
        <div className="feed-active-filter">
          {active.kind === "actor" ? (
            <Avatar name={active.label} color="var(--accent)" size={28} url={active.avatar_url ?? null} />
          ) : (
            active.artwork_url ? (
              <img src={active.artwork_url} alt="" width={24} height={36} style={{ objectFit: "cover", border: "1px solid var(--void)" }} />
            ) : null
          )}
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--void)" }}>
            {active.kind === "actor" ? "Filtering by " : "Films featuring "}
            <strong>{active.label}</strong>
          </span>
          <button type="button" onClick={clearFilter} aria-label="Clear filter" className="feed-active-filter-close">×</button>
        </div>
      ) : (
        <div className="search-pill">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            type="search"
            name="feed-search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Filter feed by user or film"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Filter by user or film…"
          />
        </div>
      )}

      {!active && open && query.trim().length >= 2 && (
        <div className="feed-search-dropdown">
          {!hasResults ? (
            <div style={{ padding: "12px 16px", fontStyle: "italic", color: "var(--muted)", fontSize: 13 }}>No matches.</div>
          ) : (
            <>
              {users.length > 0 && (
                <>
                  <div className="feed-search-section">Users</div>
                  {users.map(u => (
                    <button key={u.id} type="button" className="feed-search-item" onClick={() => applyFilter("actor", u.id)}>
                      <Avatar name={u.username} color="var(--accent)" size={28} url={u.avatar_url} />
                      <span>{u.username}</span>
                    </button>
                  ))}
                </>
              )}
              {films.length > 0 && (
                <>
                  <div className="feed-search-section">Films</div>
                  {films.map(f => (
                    <button key={f.id} type="button" className="feed-search-item" onClick={() => applyFilter("film", f.id)}>
                      {f.artwork_url ? (
                        <img src={f.artwork_url} alt="" width={28} height={42} style={{ objectFit: "cover", border: "1px solid var(--muted)" }} />
                      ) : (
                        <div style={{ width: 28, height: 42, background: "var(--void-2)" }} />
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                        <span style={{ fontSize: 13 }}>{f.title}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>{f.director} · {f.year}</span>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function filterUsers(users: FeedSearchUser[], query: string) {
  return users.filter(u =>
    u.username.toLowerCase().includes(query) ||
    (u.display_name?.toLowerCase().includes(query) ?? false)
  );
}

function filterFilms(films: FeedSearchFilm[], query: string) {
  return films.filter(f =>
    f.title.toLowerCase().includes(query) ||
    f.director.toLowerCase().includes(query) ||
    String(f.year).includes(query)
  );
}

function filterFeedSearchResults(results: { users: FeedSearchUser[]; films: FeedSearchFilm[] }, query: string) {
  return {
    users: filterUsers(results.users, query),
    films: filterFilms(results.films, query),
  };
}
