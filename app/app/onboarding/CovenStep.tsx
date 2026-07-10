"use client";

import { useState } from "react";
import Avatar from "@/components/Avatar";
import { initialSelection, toggleFollower } from "./coven-step-logic";

export interface StarterProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  starters: StarterProfile[];
  onSubmit: (followIds: string[]) => void;
  onBack: () => void;
  submitting: boolean;
}

export default function CovenStep({ starters, onSubmit, onBack, submitting }: Props) {
  const [selected, setSelected] = useState<string[]>(initialSelection(starters));

  function toggleStarter(id: string) {
    setSelected(s => toggleFollower(s, id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <p className="caps" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 8 }}>Choose who you want beside you</p>
        <p style={{ fontFamily: "var(--font-serif)", color: "var(--muted)", fontSize: 14, margin: 0 }}>
          Covenfolk can summon you to a gazing, recommend films directly, compare shared taste, and plan a watch with you.
        </p>
      </div>
      {starters.length === 0 ? (
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", fontSize: 14 }}>
          No starter accounts yet.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 12 }}>
          {starters.map(s => {
            const isSelected = selected.includes(s.id);
            return (
              <button key={s.id} type="button" onClick={() => toggleStarter(s.id)}
                style={{ background: "transparent", border: "none", padding: "8px 4px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
              >
                <div style={{ borderRadius: "50%", outline: isSelected ? "2px solid var(--accent)" : "2px solid transparent", outlineOffset: 2 }}>
                  <Avatar name={s.username} color="var(--accent)" size={40} url={s.avatar_url} />
                </div>
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: isSelected ? "var(--accent)" : "var(--muted)", textAlign: "center", wordBreak: "break-all" }}>
                  {s.username}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" onClick={onBack} className="btn btn-outline btn-sm" disabled={submitting}>← Back</button>
        <button type="button" onClick={() => onSubmit(selected)} disabled={submitting} className="btn btn-lg">
          {submitting ? "Entering…" : "Begin →"}
        </button>
      </div>
    </div>
  );
}
