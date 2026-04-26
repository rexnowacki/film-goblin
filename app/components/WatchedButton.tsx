"use client";

import { useState } from "react";
import { logWatch } from "@/lib/actions/watched";
import WatchModal from "./WatchModal";

interface Props {
  filmId: string;
  filmTitle: string;
  initialCount: number;
  onLogged?: () => void;
}

export default function WatchedButton({ filmId, filmTitle, initialCount, onLogged }: Props) {
  const [count, setCount] = useState(initialCount);
  const [modalOpen, setModalOpen] = useState(false);

  async function saveModal({ watched_at, note }: { watched_at: string; note: string }) {
    await logWatch(filmId, { watched_at, note: note || null });
    const wasFirst = count === 0;
    setCount(c => c + 1);
    if (wasFirst) onLogged?.();
  }

  return (
    <>
      <button
        className="btn btn-outline btn-lg"
        onClick={() => setModalOpen(true)}
        style={{ color: "var(--bone)", borderColor: "var(--bone)" }}
      >
        {count === 0 ? "+ Watched" : `✓ Watched · ${count}`}
      </button>
      {modalOpen && (
        <WatchModal
          open={modalOpen}
          mode="new"
          initial={{ watched_at: new Date().toISOString().slice(0, 10), note: "" }}
          filmTitle={filmTitle}
          onSave={saveModal}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
