"use client";

import { useState, useTransition } from "react";
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
  const [pending, start] = useTransition();

  function quickLog() {
    start(async () => {
      try {
        await logWatch(filmId);
        setCount(c => c + 1);
        onLogged?.();
      } catch (e) {
        console.error(e);
      }
    });
  }

  function click() {
    if (count === 0) {
      quickLog();
    } else {
      setModalOpen(true);
    }
  }

  async function saveModal({ watched_at, note }: { watched_at: string; note: string }) {
    await logWatch(filmId, { watched_at, note: note || null });
    setCount(c => c + 1);
    if (count === 0) onLogged?.(); // belt-and-braces; quickLog path covers count=0
  }

  return (
    <>
      <button
        className="btn btn-outline btn-lg"
        onClick={click}
        disabled={pending}
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
