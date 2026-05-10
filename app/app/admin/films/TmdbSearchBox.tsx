"use client";

import { useState } from "react";
import { adminSearchTmdb, adminLookupTmdb, type TmdbCandidate } from "@/lib/actions/admin/tmdb";
import type { FilmFormFields } from "@/lib/actions/admin/films";

interface Props {
  onPick: (fields: FilmFormFields) => void;
}

export default function TmdbSearchBox({ onPick }: Props) {
  const [term, setTerm] = useState("");
  const [candidates, setCandidates] = useState<TmdbCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setCandidates([]);
    setLoading(true);
    try {
      const result = await adminSearchTmdb(term);
      if (result.ok) {
        setCandidates(result.candidates);
        if (result.candidates.length === 0) setErr(`No TMDB results for "${term}".`);
      } else {
        setErr(result.error);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function onSelect(c: TmdbCandidate) {
    setPicking(c.tmdb_id);
    setErr(null);
    try {
      const result = await adminLookupTmdb(c.tmdb_id);
      if (result.ok) {
        onPick(result.fields);
      } else {
        setErr(result.error);
        setPicking(null);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lookup failed.");
      setPicking(null);
    }
  }

  return (
    <div>
      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder="Search TMDB by title…"
          style={{ flex: 1, padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 16 }}
        />
        <button type="submit" className="btn btn-sm" disabled={loading || !term.trim()}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {err && (
        <div style={{ color: "var(--danger)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>
          {err}
        </div>
      )}

      {candidates.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {candidates.map(c => (
            <button
              key={c.tmdb_id}
              type="button"
              onClick={() => onSelect(c)}
              disabled={picking !== null}
              style={{
                textAlign: "left",
                display: "grid",
                gridTemplateColumns: "48px 1fr auto",
                gap: 12,
                alignItems: "center",
                padding: 10,
                background: "var(--void-2)",
                border: "1px solid #333",
                color: "var(--bone)",
                cursor: picking !== null ? "default" : "pointer",
                fontFamily: "inherit",
                opacity: picking !== null && picking !== c.tmdb_id ? 0.5 : 1,
              }}
            >
              {c.poster_url
                ? <img src={c.poster_url} alt="" width={48} height={72} style={{ objectFit: "cover" }} />
                : <div style={{ width: 48, height: 72, background: "#222" }} />
              }
              <div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 16 }}>{c.title}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{c.year ?? "—"}</div>
                {c.overview && (
                  <div style={{ fontSize: 11, opacity: 0.5, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}>
                    {c.overview}
                  </div>
                )}
              </div>
              <span className="caps" style={{ fontSize: 10, opacity: 0.6, whiteSpace: "nowrap" }}>
                {picking === c.tmdb_id ? "Loading…" : "Pick →"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
