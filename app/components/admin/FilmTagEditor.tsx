"use client";

import { useState, useTransition } from "react";
import { setFilmTags } from "@/lib/actions/admin/film-tags";
import type { TagOption } from "@/lib/queries/film-tags";

interface Props {
  filmId: string;
  allSubgenres: TagOption[];
  allVibes: TagOption[];
  initialSubgenreId: string | null;
  initialVibeIds: string[];
}

const MAX_VIBES = 3;

export default function FilmTagEditor({
  filmId,
  allSubgenres,
  allVibes,
  initialSubgenreId,
  initialVibeIds,
}: Props) {
  const [subgenreId, setSubgenreId] = useState<string | null>(initialSubgenreId);
  const [vibeIds, setVibeIds] = useState<Set<string>>(new Set(initialVibeIds));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function toggleVibe(id: string) {
    setVibeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_VIBES) {
        next.add(id);
      }
      return next;
    });
    setSaved(false);
  }

  function pickSubgenre(id: string | null) {
    setSubgenreId(id);
    setSaved(false);
  }

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await setFilmTags({
        filmId,
        subgenreTagId: subgenreId,
        vibeTagIds: Array.from(vibeIds),
      });
      if (res.ok) setSaved(true);
      else setError(res.error);
    });
  }

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--muted)" }}>
      <h2 className="caps" style={{ fontSize: 14, color: "var(--accent)", marginBottom: 16 }}>
        Tags
      </h2>

      <div style={{ marginBottom: 20 }}>
        <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>
          Sub-genre {subgenreId && <span style={{ color: "var(--muted)" }}>(tap to clear)</span>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {allSubgenres.map(t => {
            const selected = subgenreId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pickSubgenre(selected ? null : t.id)}
                className={`tag-edit-pill ${selected ? "is-selected" : ""}`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>
          Vibes <span style={{ color: "var(--muted)" }}>({vibeIds.size} / {MAX_VIBES})</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {allVibes.map(t => {
            const selected = vibeIds.has(t.id);
            const disabled = !selected && vibeIds.size >= MAX_VIBES;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleVibe(t.id)}
                disabled={disabled}
                className={`tag-edit-pill ${selected ? "is-selected" : ""}`}
                style={disabled ? { opacity: 0.4 } : undefined}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" onClick={save} disabled={pending} className="btn btn-sm">
          {pending ? "Saving…" : "Save tags"}
        </button>
        {saved && <span style={{ color: "var(--accent)", fontStyle: "italic", fontSize: 13 }}>Saved.</span>}
        {error && <span style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );
}
