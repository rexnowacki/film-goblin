"use client";

import { useState, useTransition } from "react";
import { recommendFilm } from "@/lib/actions/recommendations";
import { useToast } from "./ToastProvider";
import BottomSheet from "./BottomSheet";

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

  function close() {
    setOpen(false);
    // Reset transient state so the next open shows a fresh form, not a
    // cached "Sent." or stale error.
    setSent(false);
    setError(null);
    setNote("");
  }

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
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      }
    });
  }

  if (!open) {
    return <button className="btn btn-lg" onClick={() => setOpen(true)}>✦ Recommend To A Coven Member</button>;
  }

  const title = (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      <span>Cast the Rune</span>
      <span className="dot-accent">•</span>
      <span style={{ fontSize: 18, color: "var(--muted)", fontFamily: "var(--font-ui)", fontWeight: 400 }}>
        {filmTitle}
      </span>
    </span>
  );

  return (
    <BottomSheet open={open} onClose={close} title={title}>
      {covenMembers.length === 0 ? (
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.5, padding: "12px 0" }}>
          You have no coven yet. Visit <a href="/coven" style={{ color: "var(--accent)", textDecoration: "underline" }}>/coven</a> to bind with someone, then come back.
        </div>
      ) : sent ? (
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", padding: "12px 0" }}>
          Sent. They&rsquo;ll see it in their feed.
        </div>
      ) : (
        <form action={send} style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0 4px" }}>
          <div>
            <div className="caps" style={{ fontSize: 11, marginBottom: 8, color: "var(--muted)" }}>Coven Member</div>
            <select
              name="to_user_id"
              required
              defaultValue=""
              style={{
                width: "100%",
                border: "1px solid var(--muted)",
                background: "transparent",
                color: "var(--bone)",
                padding: "10px 12px",
                fontFamily: "var(--font-ui)",
                fontSize: 16,
              }}
            >
              <option value="" style={{ background: "#141414" }}>Choose someone…</option>
              {covenMembers.map(m => (
                <option key={m.id} value={m.id} style={{ background: "#141414" }}>
                  @{m.username}{m.display_name ? ` · ${m.display_name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="caps" style={{ fontSize: 11, marginBottom: 8, color: "var(--muted)" }}>A Whisper</div>
            <textarea
              name="note"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="watch this one alone, with the lights off…"
              style={{
                width: "100%",
                border: "1px solid var(--muted)",
                background: "transparent",
                color: "var(--bone)",
                padding: 10,
                fontFamily: "var(--font-serif)",
                fontSize: 14,
                resize: "none",
                outline: "none",
              }}
            />
          </div>
          {error && (
            <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={pending}
            className="btn"
            style={{ width: "100%", justifyContent: "center" }}
          >
            {pending ? "Sealing…" : "✦ Seal & Send"}
          </button>
        </form>
      )}
    </BottomSheet>
  );
}
