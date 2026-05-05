"use client";

import { useState } from "react";
import { FLAVOR_CARDS, getSelectedTagIds } from "./taste-step-logic";

interface Props {
  initialUsername: string;
  laneTagMap: Record<string, string>;
  onNext: (username: string, laneTagIds: string[]) => void;
}

const USERNAME_RE = /^[a-z0-9._]+$/;

export default function TasteStep({ initialUsername, laneTagMap, onNext }: Props) {
  const [username, setUsername] = useState(initialUsername);
  const [selected, setSelected] = useState<string[]>([]);

  const trimmed = username.trim();
  const usernameOk = trimmed.length > 0 && USERNAME_RE.test(trimmed);
  const usernameError = trimmed.length > 0 && !USERNAME_RE.test(trimmed)
    ? "lowercase letters, numbers, dots, underscores only"
    : "";

  function toggleCard(label: string) {
    setSelected(s => s.includes(label) ? s.filter(l => l !== label) : [...s, label]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <label className="caps" style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 8 }}>
          Your Handle
        </label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value.toLowerCase())}
          placeholder="your.handle"
          autoCapitalize="none"
          autoCorrect="off"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 18,
            background: "#111",
            border: "1px solid #333",
            color: "var(--bone)",
            padding: "10px 14px",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
        {usernameError && (
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--accent)", marginTop: 6 }}>
            {usernameError}
          </p>
        )}
      </div>

      <div>
        <p className="caps" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
          What draws you to horror? (pick any)
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
          {FLAVOR_CARDS.map(card => {
            const isSelected = selected.includes(card.label);
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => toggleCard(card.label)}
                style={{
                  background: isSelected ? "rgba(255,45,136,0.12)" : "#111",
                  border: `1px solid ${isSelected ? "var(--accent)" : "#333"}`,
                  color: "var(--bone)",
                  padding: "14px 12px",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 4 }}>
                  {card.label}
                </div>
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)" }}>
                  {card.descriptor}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onNext(trimmed, getSelectedTagIds(selected, laneTagMap))}
        disabled={!usernameOk}
        className="btn btn-lg"
        style={{ alignSelf: "flex-end", opacity: usernameOk ? 1 : 0.4 }}
      >
        Next →
      </button>
    </div>
  );
}
