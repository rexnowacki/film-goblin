"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { searchFeedTargets, type FeedSearchFilm } from "@/lib/actions/feed-search";
import { useCachedTypeahead } from "@/lib/hooks/useCachedTypeahead";
import {
  scheduleGoblinPick,
  updateGoblinPick,
  deleteGoblinPick,
  clearGoblinPickChat,
} from "@/lib/actions/admin/goblin-pick";
import type { GoblinPickRow } from "@/lib/queries/goblin-pick";

interface Props {
  rows: GoblinPickRow[];
}

// Arizona is UTC-7 year-round (no DST), so 4am Tucson = 11:00 UTC.
const TUCSON_TZ = "America/Phoenix";
const TUCSON_4AM_HOUR_UTC = 11;

function nextMondayDateString(): string {
  const d = new Date();
  d.setUTCHours(TUCSON_4AM_HOUR_UTC, 0, 0, 0);
  while (d.getUTCDay() !== 1 || d.getTime() <= Date.now()) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

function dateStringToIso(dateStr: string): string {
  return `${dateStr}T${String(TUCSON_4AM_HOUR_UTC).padStart(2, "0")}:00:00.000Z`;
}

function formatTucson(iso: string): string {
  const d = new Date(iso);
  const fmt = d.toLocaleString("en-US", {
    timeZone: TUCSON_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${fmt} Tucson`;
}

export default function GoblinPickQueueManager({ rows }: Props) {
  const now = Date.now();
  const active = rows.find(r => new Date(r.effective_at).getTime() <= now) ?? null;
  const queued = rows.filter(r => new Date(r.effective_at).getTime() > now)
    .sort((a, b) => new Date(a.effective_at).getTime() - new Date(b.effective_at).getTime());
  const past = rows
    .filter(r => r !== active && new Date(r.effective_at).getTime() <= now)
    .slice(0, 5);

  return (
    <div>
      {active && <ActivePickCard row={active} />}

      <ScheduleForm />

      <section style={{ marginTop: 36 }}>
        <h2 className="eyebrow" style={{ color: "var(--muted)", marginBottom: 14, letterSpacing: "0.12em" }}>
          Queued ({queued.length})
        </h2>
        {queued.length === 0 ? (
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)" }}>
            Nothing scheduled. Pick a film above to queue the next one.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {queued.map(r => <QueuedRow key={r.id} row={r} />)}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section style={{ marginTop: 36 }}>
          <h2 className="eyebrow" style={{ color: "var(--muted)", marginBottom: 14, letterSpacing: "0.12em" }}>
            Recent ({past.length})
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {past.map(r => (
              <li key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>
                <span style={{ minWidth: 130 }}>{formatTucson(r.effective_at)}</span>
                <span style={{ color: "var(--bone)" }}>{r.film.title}</span>
                <span style={{ fontStyle: "italic" }}>· {r.film.director}, {r.film.year}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ActivePickCard({ row }: { row: GoblinPickRow }) {
  const [whisper, setWhisper] = useState(row.whisper_text ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  async function save() {
    setSaving(true);
    const r = await updateGoblinPick(row.id, { whisper_text: whisper });
    setSaving(false);
    if (r.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  async function clearChat() {
    if (!confirm(`Delete every ritual chat message for "${row.film.title}"? This cannot be undone.`)) return;
    setClearing(true);
    const r = await clearGoblinPickChat(row.id);
    setClearing(false);
    if (r.ok) {
      setCleared(true);
      setTimeout(() => setCleared(false), 3000);
    } else {
      alert(`Clear failed: ${r.error}`);
    }
  }

  return (
    <section style={{ marginBottom: 32, padding: 16, border: "1px solid var(--accent)", background: "var(--void-2)" }}>
      <div className="eyebrow" style={{ color: "var(--accent)", fontSize: 10, marginBottom: 10, letterSpacing: "0.14em" }}>
        Active · Set live {formatTucson(row.effective_at)}
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 16 }}>
        {row.film.artwork_url && (
          <img src={row.film.artwork_url} alt="" width={56} height={84} style={{ objectFit: "cover", border: "1px solid var(--muted)" }} />
        )}
        <div>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 18, color: "var(--bone)", marginBottom: 2 }}>
            {row.film.title}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)" }}>
            {row.film.director} · {row.film.year}
          </div>
        </div>
      </div>

      <div className="eyebrow" style={{ color: "var(--muted)", fontSize: 10, marginBottom: 6, letterSpacing: "0.12em" }}>
        Whisper
      </div>
      <textarea
        rows={4}
        maxLength={280}
        placeholder="Why does the goblin recommend this one…"
        value={whisper}
        onChange={e => setWhisper(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box", background: "var(--void)",
          border: "1px solid #444", color: "var(--bone)", padding: "10px 12px",
          fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, lineHeight: 1.6,
          resize: "vertical", outline: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
        <button type="button" className="btn btn-sm" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save Whisper"}
        </button>
        {saved && (
          <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--accent)" }}>
            ✓ Saved
          </span>
        )}
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)" }}>
          {whisper.length}/280
        </span>
      </div>

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #333" }}>
        <div className="eyebrow" style={{ color: "var(--muted)", fontSize: 10, marginBottom: 8, letterSpacing: "0.12em" }}>
          Moderation
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={clearing}
            onClick={clearChat}
            style={{
              background: "transparent",
              border: "1px solid var(--blood, #d93a2e)",
              color: "var(--blood, #d93a2e)",
              padding: "7px 10px",
              cursor: clearing ? "default" : "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {clearing ? "Clearing..." : "Nuke Chat"}
          </button>
          {cleared && (
            <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--accent)" }}>
              Chat cleared
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function ScheduleForm() {
  const [film, setFilm] = useState<FeedSearchFilm | null>(null);
  const [date, setDate] = useState(nextMondayDateString());
  const [whisper, setWhisper] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function reset() {
    setFilm(null);
    setDate(nextMondayDateString());
    setWhisper("");
  }

  async function submit() {
    if (!film) { setError("Pick a film first."); return; }
    setError(null);
    setSubmitting(true);
    const iso = dateStringToIso(date);
    startTransition(async () => {
      const r = await scheduleGoblinPick(film.id, iso, whisper);
      setSubmitting(false);
      if (r.ok) {
        setSavedTitle(film.title);
        reset();
        setTimeout(() => setSavedTitle(null), 3000);
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <section style={{ marginBottom: 32, padding: 16, border: "1px solid #333", background: "var(--void-2)" }}>
      <div className="eyebrow" style={{ color: "var(--bone)", fontSize: 11, marginBottom: 14, letterSpacing: "0.14em" }}>
        Schedule a New Pick
      </div>

      {savedTitle && (
        <div style={{ marginBottom: 12, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--accent)" }}>
          ✓ Queued "{savedTitle}"
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <Label>Film</Label>
        {film ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 10, border: "1px solid #444", background: "var(--void)" }}>
            {film.artwork_url && (
              <img src={film.artwork_url} alt="" width={32} height={48} style={{ objectFit: "cover" }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--bone)" }}>{film.title}</div>
              <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, color: "var(--muted)" }}>
                {film.director} · {film.year}
              </div>
            </div>
            <button type="button" onClick={() => setFilm(null)} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 18, cursor: "pointer", padding: "0 6px" }}>×</button>
          </div>
        ) : (
          <FilmSearchPicker onPick={setFilm} />
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <Label>Goes live</Label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{
            background: "var(--void)", border: "1px solid #444", color: "var(--bone)",
            padding: "8px 10px", fontFamily: "var(--font-ui)", fontSize: 13,
            colorScheme: "dark", outline: "none",
          }}
        />
        <div style={{ marginTop: 6, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)" }}>
          {formatTucson(dateStringToIso(date))} · Card auto-rotates at this moment.
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Label>Whisper (optional)</Label>
        <textarea
          rows={3}
          maxLength={280}
          placeholder="Why does the goblin recommend this one…"
          value={whisper}
          onChange={e => setWhisper(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", background: "var(--void)",
            border: "1px solid #444", color: "var(--bone)", padding: "10px 12px",
            fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, lineHeight: 1.6,
            resize: "vertical", outline: "none",
          }}
        />
        <div style={{ marginTop: 4, fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
          {whisper.length}/280
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 12, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--blood, #d93a2e)" }}>
          {error}
        </div>
      )}

      <button type="button" className="btn" disabled={submitting || !film} onClick={submit}>
        {submitting ? "Scheduling…" : "Schedule Pick"}
      </button>
    </section>
  );
}

function QueuedRow({ row }: { row: GoblinPickRow }) {
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!confirm(`Drop the queued pick "${row.film.title}" (${formatTucson(row.effective_at)})?`)) return;
    setDeleting(true);
    const r = await deleteGoblinPick(row.id);
    if (!r.ok) {
      setDeleting(false);
      alert(`Delete failed: ${r.error}`);
    }
  }

  return (
    <li style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 12, border: "1px solid #2a2a2a", background: "var(--void-2)" }}>
      {row.film.artwork_url && (
        <img src={row.film.artwork_url} alt="" width={40} height={60} style={{ objectFit: "cover", border: "1px solid var(--muted)" }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="eyebrow" style={{ color: "var(--accent)", fontSize: 9, marginBottom: 4, letterSpacing: "0.12em" }}>
          {formatTucson(row.effective_at)}
        </div>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--bone)" }}>{row.film.title}</div>
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, color: "var(--muted)", marginBottom: row.whisper_text ? 6 : 0 }}>
          {row.film.director} · {row.film.year}
        </div>
        {row.whisper_text && (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--bone)", opacity: 0.85, lineHeight: 1.5 }}>
            "{row.whisper_text.slice(0, 140)}{row.whisper_text.length > 140 ? "…" : ""}"
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        style={{ background: "none", border: "1px solid #444", color: "var(--muted)", padding: "4px 8px", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 11 }}
      >
        {deleting ? "…" : "Drop"}
      </button>
    </li>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="eyebrow" style={{ color: "var(--muted)", fontSize: 10, marginBottom: 6, letterSpacing: "0.12em" }}>
      {children}
    </div>
  );
}

function FilmSearchPicker({ onPick }: { onPick: (f: FeedSearchFilm) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const emptyFilms = useMemo<FeedSearchFilm[]>(() => [], []);
  const searchFilms = useCallback(async (q: string) => (await searchFeedTargets(q)).films, []);
  const films = useCachedTypeahead(query, {
    search: searchFilms,
    filter: filterFilmSearchResults,
    empty: emptyFilms,
  });

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
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
              <button
                key={f.id}
                type="button"
                className="feed-search-item"
                onClick={() => { onPick(f); setOpen(false); setQuery(""); }}
              >
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
                  Choose →
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function filterFilmSearchResults(films: FeedSearchFilm[], query: string) {
  return films.filter(f =>
    f.title.toLowerCase().includes(query) ||
    f.director.toLowerCase().includes(query) ||
    String(f.year).includes(query)
  );
}
