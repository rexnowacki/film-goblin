"use client";

import { useState, useTransition } from "react";
import { setLanes } from "@/lib/actions/fyp/lanes";
import type { TagOption } from "@/lib/queries/film-tags";

interface Props {
  initialLaneIds: string[];
  vocab: { subgenre: TagOption[]; tone: TagOption[]; theme: TagOption[] };
}

export default function LanePicker({ initialLaneIds, vocab }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set(initialLaneIds));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await setLanes(Array.from(picked));
      setMsg(r.ok ? "Saved." : r.error);
    });
  }

  function ChipRow(opts: TagOption[]) {
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {opts.map(o => (
          <button
            type="button"
            key={o.id}
            className={`tag-edit-pill ${picked.has(o.id) ? "is-selected" : ""}`}
            onClick={() => toggle(o.id)}
          >
            {o.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 32 }}>
      <h3 className="head" style={{ fontSize: 22, marginBottom: 8 }}>Lanes</h3>
      <p style={{ fontFamily: "var(--font-serif)", fontSize: 14, fontStyle: "italic", color: "var(--muted)", margin: "0 0 16px" }}>
        Tap tags you're into. We'll surface more of these on your For You feed.
      </p>

      <div className="caps" style={{ fontSize: 10, marginTop: 12 }}>Sub-genre</div>
      {ChipRow(vocab.subgenre)}

      <div className="caps" style={{ fontSize: 10, marginTop: 16 }}>Tone</div>
      {ChipRow(vocab.tone)}

      <div className="caps" style={{ fontSize: 10, marginTop: 16 }}>Theme</div>
      {ChipRow(vocab.theme)}

      <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
        <button type="button" className="btn" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save lanes"}
        </button>
        {msg && <span style={{ fontSize: 12, color: msg === "Saved." ? "var(--accent)" : "var(--danger)" }}>{msg}</span>}
      </div>
    </div>
  );
}
