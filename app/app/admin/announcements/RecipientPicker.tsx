"use client";

import { useMemo, useState } from "react";
import { filterCovenMembers, type Searchable } from "@/components/recommend-modal-search";

export interface RecipientPickerProps {
  // Full profile list comes from the server page; we don't fetch here.
  profiles: Searchable[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function RecipientPicker({ profiles, selectedIds, onChange }: RecipientPickerProps) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const matches = filterCovenMembers(profiles, query).slice(0, 30);

  const selectedProfiles = profiles.filter(p => selectedSet.has(p.id));

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter(x => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div>
      {selectedProfiles.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {selectedProfiles.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              style={{
                background: "var(--accent)",
                color: "var(--accent-ink)",
                border: "none",
                padding: "6px 12px",
                fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
                fontSize: 12,
                cursor: "pointer",
                borderRadius: 0,
              }}
              aria-label={`Remove ${p.username}`}
            >
              {p.username} ✕
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by username…"
        style={{
          width: "100%",
          padding: 10,
          background: "var(--void-2)",
          border: "2px solid var(--muted)",
          color: "var(--bone)",
          fontFamily: "var(--font-ui)",
          fontSize: 14,
        }}
      />

      {query.trim().length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 240, overflowY: "auto", border: "1px solid var(--muted)" }}>
          {matches.length === 0 ? (
            <div style={{ padding: 10, color: "var(--muted)", fontSize: 13, fontStyle: "italic" }}>
              No matches.
            </div>
          ) : (
            matches.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: selectedSet.has(p.id) ? "var(--void-2)" : "transparent",
                  color: "var(--bone)",
                  border: "none",
                  borderBottom: "1px solid var(--muted)",
                  padding: "8px 10px",
                  fontFamily: "var(--font-ui)",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {p.username}
                {p.display_name && p.display_name !== p.username && (
                  <span style={{ color: "var(--muted)", marginLeft: 8 }}>({p.display_name})</span>
                )}
                {selectedSet.has(p.id) && <span style={{ float: "right" }}>✓</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
