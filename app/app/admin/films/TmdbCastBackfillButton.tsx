"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminBackfillTmdbCast } from "@/lib/actions/admin/films";

export default function TmdbCastBackfillButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function runBackfill() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminBackfillTmdbCast();
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(`Scanned ${result.scanned}; added ${result.updated}; already had cast ${result.skipped}; no TMDB cast ${result.missing}; failed ${result.failed}.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button type="button" className="btn btn-sm btn-outline" onClick={runBackfill} disabled={busy}>
        {busy ? "Checking TMDB..." : "Backfill TMDB cast"}
      </button>
      {message && (
        <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)" }}>
          {message}
        </span>
      )}
    </div>
  );
}
