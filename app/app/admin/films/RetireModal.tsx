"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminRetireFilm } from "@/lib/actions/admin/films";

interface Props {
  filmId: string;
  title: string;
  year: number;
  counts: { watchlist: number; lists: number; reviews: number; activity: number };
}

export default function RetireModal({ filmId, title, year, counts }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function onConfirm() {
    setSubmitting(true);
    setErr(null);
    const res = await adminRetireFilm(filmId);
    setSubmitting(false);
    if (!res.ok) { setErr(res.error); return; }
    setOpen(false);
    router.push("/admin/films");
  }

  return (
    <>
      <button type="button" className="btn btn-sm" style={{ background: "transparent", color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => setOpen(true)}>
        Retire film
      </button>
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "grid", placeItems: "center", padding: 20 }}>
          <div style={{ background: "var(--bone)", color: "var(--void)", border: "3px solid var(--void)", boxShadow: "6px 6px 0 var(--accent)", padding: 22, maxWidth: 460, width: "100%" }}>
            <div className="head" style={{ fontSize: 22, marginBottom: 10 }}>Retire {title} ({year})?</div>
            <ul style={{ fontFamily: "var(--font-ui)", fontSize: 13, margin: "0 0 16px 0", paddingLeft: 18 }}>
              <li>Watchlist entries referencing it: <strong>{counts.watchlist}</strong> — stay intact</li>
              <li>List entries: <strong>{counts.lists}</strong> — stay intact</li>
              <li>Reviews: <strong>{counts.reviews}</strong> — stay intact</li>
              <li>Activity entries: <strong>{counts.activity}</strong> — stay intact</li>
            </ul>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginBottom: 16 }}>
              Sets <code>tracking = false</code> and <code>available = false</code>. Reversible — edit the film and flip the flags back on.
            </p>
            {err && <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-sm btn-outline" style={{ color: "var(--void)", borderColor: "var(--void)" }} onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </button>
              <button type="button" className="btn btn-sm" style={{ background: "var(--danger)", color: "var(--bone)", borderColor: "var(--danger)" }} onClick={onConfirm} disabled={submitting}>
                {submitting ? "Retiring…" : "Retire film"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
