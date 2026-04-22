"use client";

import { useState, useTransition } from "react";
import { recommendFilm } from "@/lib/actions/recommendations";

interface Props {
  filmId: string;
  filmTitle: string;
}

export default function RecommendModal({ filmId, filmTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [toHandle, setToHandle] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  async function send(formData: FormData) {
    start(async () => {
      setError(null);
      try {
        // MVP: for simplicity, paste the recipient's UUID directly.
        // Full "pick a coven member" UI is a later task.
        const toUserId = String(formData.get("to_user_id") || "");
        const noteVal = String(formData.get("note") || "");
        await recommendFilm(filmId, toUserId, noteVal);
        setSent(true);
      } catch (e: any) {
        setError(e.message ?? String(e));
      }
    });
  }

  if (!open) {
    return (
      <button className="btn btn-lg" onClick={() => setOpen(true)}>
        ✦ Recommend To A Friend
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(10,10,10,0.82)",
      display: "grid", placeItems: "center",
      zIndex: 100, padding: 20,
    }} onClick={() => setOpen(false)}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)",
        boxShadow: "12px 12px 0 var(--accent)",
        maxWidth: 560, width: "100%",
        padding: "32px 32px 24px",
        transform: "rotate(-0.5deg)",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Cast The Rune ✦</div>
        <h2 className="display" style={{ fontSize: 44, margin: "0 0 16px", lineHeight: 0.9 }}>
          Recommend <em style={{ color: "var(--accent)" }}>{filmTitle}</em>
        </h2>
        {sent ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>Sent. They'll see it in their feed.</div>
        ) : (
          <form action={send}>
            <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Recipient (user id)</div>
            <input name="to_user_id" required value={toHandle} onChange={e => setToHandle(e.target.value)}
              placeholder="paste their UUID (full picker lands in a later sub-project)"
              style={{ width: "100%", border: "2px solid var(--void)", padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 11, marginBottom: 14 }} />
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
