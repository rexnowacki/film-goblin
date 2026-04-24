"use client";

import { useState } from "react";
import { adminSearchAppleTv, type SearchCandidate, type SearchResult } from "@/lib/actions/admin/apple-tv-search";
import type { ITunesSearchHit } from "@/lib/actions/admin/films";

interface Props {
  onPick: (hit: ITunesSearchHit) => void;
}

function errorMessage(result: Extract<SearchResult, { ok: false }>, term: string): string {
  switch (result.reason) {
    case "brave-empty":
      return `No Apple TV results for "${term}". Try a different spelling or use manual entry.`;
    case "all-streaming-only":
      return `Apple TV has results for "${term}" but none are buyable (all streaming-only).`;
    case "brave-error":
      return "Search unavailable — try again in a moment.";
    default: {
      const _exhaustive: never = result.reason;
      return _exhaustive;
    }
  }
}

export default function AppleTvSearchBox({ onPick }: Props) {
  const [term, setTerm] = useState("");
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setCandidates([]);
    setLoading(true);
    try {
      const result = await adminSearchAppleTv(term);
      if (result.ok) {
        setCandidates(result.candidates);
        if (result.candidates.length === 0) setErr("No results.");
      } else {
        setErr(errorMessage(result, term));
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder="Search Apple TV (title)…"
          style={{ flex: 1, padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14 }}
        />
        <button type="submit" className="btn btn-sm" disabled={loading || !term.trim()}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {err && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>{err}</div>}
      {candidates.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 20 }}>
          {candidates.map(c => (
            <button
              key={c.itunes_id}
              type="button"
              onClick={() => onPick(c)}
              style={{ textAlign: "left", display: "grid", gridTemplateColumns: "48px 1fr auto auto", gap: 12, alignItems: "center", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)", cursor: "pointer", fontFamily: "inherit" }}
            >
              {c.artwork_url ? <img src={c.artwork_url} alt="" width={48} height={72} style={{ objectFit: "cover" }} /> : <div style={{ width: 48, height: 72, background: "#222" }} />}
              <div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 16 }}>{c.title}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{c.director || "—"} · {c.year || "—"}</div>
              </div>
              <span className="caps" style={{ fontSize: 10, opacity: 0.5 }}>
                {c.via === "itunes" ? "via iTunes" : "via Apple TV search"}
              </span>
              <span className="caps" style={{ fontSize: 10, opacity: 0.6 }}>Pick →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
