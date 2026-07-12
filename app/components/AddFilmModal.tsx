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
      className="add-film-backdrop"
      onMouseDown={onClose}
    >
      <div
        className="add-film-modal grain"
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-film-title"
      >
        <div className="add-film-modal__masthead">
          <div className="add-film-modal__title-lockup">
            <h2 id="add-film-title" className="add-film-modal__title">Add Film</h2>
            <p>Feed the Pit.</p>
          </div>
          <img className="add-film-modal__oracle" src="/add-film-oracle.png" alt="A goblin peering into a crystal ball" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Add Film"
            className="add-film-modal__close"
          ><span aria-hidden="true">×</span></button>
        </div>
        <AddFilmClient onSuccess={onClose} variant="modal" />
      </div>
    </div>
  );
}
