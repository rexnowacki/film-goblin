"use client";

import { useState, useTransition } from "react";
import { recommendFilm } from "@/lib/actions/recommendations";
import { useToast } from "./ToastProvider";

interface CovenMember {
  id: string;
  username: string;
  display_name: string | null;
}

interface Props {
  filmId: string;
  filmTitle: string;
  covenMembers: CovenMember[];
}

export default function RecommendModal({ filmId, filmTitle, covenMembers }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  async function send(formData: FormData) {
    start(async () => {
      setError(null);
      try {
        const toUserId = String(formData.get("to_user_id") || "");
        if (!toUserId) { setError("Pick a coven member."); return; }
        const noteVal = String(formData.get("note") || "");
        await recommendFilm(filmId, toUserId, noteVal);
        setSent(true);
        toast("Recommendation sent");
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    });
  }

  if (!open) {
    return <button className="btn btn-lg" onClick={() => setOpen(true)}>✦ Recommend To A Coven Member</button>;
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.82)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }} onClick={() => setOpen(false)}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bone)", color: "var(--void)", border: "3px solid var(--void)", boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--accent)", maxWidth: 560, width: "100%", padding: "var(--modal-pad) var(--modal-pad) calc(var(--modal-pad) - 8px)", transform: "rotate(var(--card-rotation))" }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Cast The Rune ✦</div>
        <h2 className="display" style={{ fontSize: 44, margin: "0 0 16px", lineHeight: 0.9 }}>
          Recommend <em style={{ color: "var(--accent)" }}>{filmTitle}</em>
        </h2>

        {covenMembers.length === 0 ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.5 }}>
            You have no coven yet. Visit <a href="/coven" style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>/coven</a> to bind with someone, then come back.
          </div>
        ) : sent ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>Sent. They'll see it in their feed.</div>
        ) : (
          <form action={send}>
            <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Coven Member</div>
            <select name="to_user_id" required defaultValue="" style={{ width: "100%", border: "2px solid var(--void)", padding: "8px 10px", fontFamily: "var(--font-ui)", fontSize: 16, marginBottom: 14, background: "var(--bone)" }}>
              <option value="">Choose someone…</option>
              {covenMembers.map(m => (
                <option key={m.id} value={m.id}>@{m.username}{m.display_name ? ` · ${m.display_name}` : ""}</option>
              ))}
            </select>
            <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>A Whisper</div>
            <textarea name="note" value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="watch this one alone, with the lights off…"
              style={{ width: "100%", border: "2px solid var(--void)", padding: 10, fontFamily: "var(--font-serif)", fontSize: 14, marginBottom: 16, resize: "none" }} />
            {error && <div style={{ color: "var(--blood)", marginBottom: 12, fontStyle: "italic" }}>{error}</div>}
            <button type="submit" disabled={pending} className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }}>
              {pending ? "Sealing…" : "✦ Seal & Send"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
