"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { logWatch } from "@/lib/actions/watched";
const WatchModal = dynamic(() => import("./WatchModal"));
import { useToast } from "./ToastProvider";

interface Props {
  filmId: string;
  filmTitle: string;
  initialCount: number;
  onLogged?: () => void;
}

export default function WatchedButton({ filmId, filmTitle, initialCount, onLogged }: Props) {
  const { toast } = useToast();
  const [count, setCount] = useState(initialCount);
  const [modalOpen, setModalOpen] = useState(false);

  async function saveModal({ watched_at, note, recommended, spoiler }: { watched_at: string; note: string; recommended: boolean | null; spoiler: boolean }) {
    await logWatch(filmId, { watched_at, note: note || null, recommended, spoiler });
    const wasFirst = count === 0;
    setCount(c => c + 1);
    if (wasFirst) onLogged?.();
    toast(`Logged ${filmTitle}`);
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
          initial={{ watched_at: new Date().toISOString().slice(0, 10), note: "", recommended: null, spoiler: false }}
          filmTitle={filmTitle}
          onSave={saveModal}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
