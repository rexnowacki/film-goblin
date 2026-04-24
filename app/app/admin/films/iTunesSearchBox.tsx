"use client";

import { useState } from "react";
import { adminSearchItunes, type ITunesSearchHit } from "@/lib/actions/admin/films";

interface Props {
  onPick: (hit: ITunesSearchHit) => void;
}

export default function ITunesSearchBox({ onPick }: Props) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<ITunesSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const results = await adminSearchItunes(term);
      setHits(results);
      if (results.length === 0) setErr("No iTunes results.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Search failed.");
    } finally { setLoading(false); }
  }

  return (
    <div>
      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder="Search iTunes (title, director, actor)…"
          style={{ flex: 1, padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14 }}
        />
        <button type="submit" className="btn btn-sm" disabled={loading || !term.trim()}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {err && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>{err}</div>}
      {hits.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 20 }}>
          {hits.map(h => (
            <button
              key={h.itunes_id}
              type="button"
              onClick={() => onPick(h)}
              style={{ textAlign: "left", display: "grid", gridTemplateColumns: "48px 1fr auto", gap: 12, alignItems: "center", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)", cursor: "pointer", fontFamily: "inherit" }}
            >
              {h.artwork_url ? <img src={h.artwork_url} alt="" width={48} height={72} style={{ objectFit: "cover" }} /> : <div style={{ width: 48, height: 72, background: "#222" }} />}
              <div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 16 }}>{h.title}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{h.director || "—"} · {h.year || "—"}</div>
              </div>
              <span className="caps" style={{ fontSize: 10, opacity: 0.6 }}>Pick →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
