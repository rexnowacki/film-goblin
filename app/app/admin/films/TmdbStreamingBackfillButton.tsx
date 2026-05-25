"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminBackfillTmdbStreaming } from "@/lib/actions/admin/films";

export default function TmdbStreamingBackfillButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function runBackfill() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminBackfillTmdbStreaming();
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(
        `Checked ${result.checked}; resolved TMDB IDs ${result.tmdbIdsResolved}; refreshed streaming ${result.refreshed}; saved providers ${result.providersSaved}; skipped ${result.skipped}; failed ${result.failed}.`,
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button type="button" className="btn btn-sm btn-outline" onClick={runBackfill} disabled={busy}>
        {busy ? "Checking TMDB..." : "Backfill TMDB IDs + streaming"}
      </button>
      {message && (
        <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)" }}>
          {message}
        </span>
      )}
    </div>
  );
}
