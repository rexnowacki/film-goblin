"use client";

import { useState } from "react";
import { adminLookupItunes, type ITunesSearchHit } from "@/lib/actions/admin/films";

interface Props {
  onPick: (hit: ITunesSearchHit) => void;
}

export default function ITunesPasteBox({ onPick }: Props) {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await adminLookupItunes(raw);
      if (res.ok) onPick(res.hit);
      else setErr(res.error);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lookup failed.");
    } finally { setLoading(false); }
  }

  return (
    <div>
      <form onSubmit={onLookup} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          value={raw}
          onChange={e => setRaw(e.target.value)}
          placeholder="Paste Apple TV URL or iTunes trackId"
          style={{ flex: 1, padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 16 }}
        />
        <button type="submit" className="btn btn-sm" disabled={loading || !raw.trim()}>
          {loading ? "Looking up…" : "Fetch"}
        </button>
      </form>
      {err && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13 }}>{err}</div>}
    </div>
  );
}
