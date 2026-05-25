"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
const FilmRequestSheet = dynamic(() => import("@/components/modals/FilmRequestSheet"));

interface Props {
  query: string;
  isSignedIn: boolean;
}

export default function FilmsEmptyState({ query, isSignedIn }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
      <div>No films match. The void returned nothing.</div>
      {isSignedIn && query && (
        <div style={{ marginTop: 20 }}>
          <button
            className="btn btn-outline"
            style={{ fontFamily: "var(--font-ui)", fontStyle: "normal", fontSize: 13 }}
            onClick={() => setSheetOpen(true)}
          >
            Summon it →
          </button>
        </div>
      )}
      {sheetOpen && (
        <FilmRequestSheet query={query} onClose={() => setSheetOpen(false)} />
      )}
    </div>
  );
}
