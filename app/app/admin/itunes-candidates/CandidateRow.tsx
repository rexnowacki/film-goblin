"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminConfirmItunesCandidate,
  adminRejectItunesCandidate,
} from "@/lib/actions/admin/itunes-candidates";
import type { PendingCandidateRow } from "@/lib/queries/admin/itunes-candidates";

interface Props {
  row: PendingCandidateRow;
}

export default function CandidateRow({ row }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy("confirm");
    setErr(null);
    const res = await adminConfirmItunesCandidate(row.id);
    if (!res.ok) {
      setErr(res.error);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  async function handleReject() {
    setBusy("reject");
    setErr(null);
    const res = await adminRejectItunesCandidate(row.id);
    if (!res.ok) {
      setErr(res.error);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{
      border: "1px solid #333",
      background: "var(--void-2)",
      padding: 16,
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16,
    }}>
      <Side
        label="TMDB film"
        title={row.film.title}
        year={row.film.year}
        director={row.film.director}
        artwork={row.film.artwork_url}
      />
      <Side
        label={`iTunes candidate · ${(row.confidence * 100).toFixed(0)}% · ${row.match_type}`}
        title={row.match_title}
        year={row.match_year ?? "—"}
        director="(iTunes provides no director)"
        artwork={row.match_artwork_url?.replace(/100x100/, "300x300") ?? ""}
      />

      <div style={{ gridColumn: "1 / span 2", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={handleConfirm} disabled={busy !== null} className="btn btn-sm btn-dark">
          {busy === "confirm" ? "Confirming…" : "Confirm match"}
        </button>
        <button onClick={handleReject} disabled={busy !== null} className="btn btn-sm btn-outline">
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
        <a href={row.itunes_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">
          Open on Apple TV ↗
        </a>
        {err && <span style={{ color: "var(--blood)", fontSize: 12 }}>{err}</span>}
      </div>
    </div>
  );
}

function Side({ label, title, year, director, artwork }: {
  label: string;
  title: string;
  year: number | string;
  director: string;
  artwork: string;
}) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {artwork ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artwork} alt="" style={{ width: 80, height: 120, objectFit: "cover", border: "1px solid #444" }} />
      ) : (
        <div style={{ width: 80, height: 120, background: "#222", border: "1px solid #444" }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="caps" style={{ fontSize: 10, color: "var(--accent)", marginBottom: 6 }}>{label}</div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, marginBottom: 4 }}>{title} <span style={{ opacity: 0.6 }}>({year})</span></div>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, opacity: 0.75 }}>{director}</div>
      </div>
    </div>
  );
}
