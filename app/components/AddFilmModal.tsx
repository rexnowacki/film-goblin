"use client";

import { useEffect } from "react";
import AddFilmClient from "@/app/admin/films/new/AddFilmClient";

export default function AddFilmModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.85)", overflowY: "auto", padding: "40px 20px 80px", display: "flex", justifyContent: "center", alignItems: "flex-start" }}
      onMouseDown={onClose}
    >
      <div
        style={{ background: "var(--void-2)", border: "2px solid var(--bone)", width: "100%", maxWidth: 760, padding: "28px 28px 36px" }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28 }}>
          <h2 className="h-display" style={{ margin: 0, fontSize: 30 }}>Add Film</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: 0, cursor: "pointer", fontSize: 24, lineHeight: 1, color: "var(--muted)", padding: "0 4px" }}
          >
            ×
          </button>
        </div>
        <AddFilmClient onSuccess={onClose} />
      </div>
    </div>
  );
}
